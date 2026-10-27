import { prisma, TxClient } from "@/lib/db/prisma"

/**
 * F-2026-10-24-133-V (vonis BOT Accountant) Putusan 1-5: jalur L3 —
 * biaya telat NON-JOB sesudah WO closed, diakui sebagai beban periode
 * berjalan lewat dokumen sumber sah (VendorBill tanpa PO jasa WO/tanpa
 * GR, atau Expense approved). TANPA schema/FK baru: tautan ke WO cukup
 * frasa penanda baku di notes/description dokumen + ActivityLog pada
 * WorkOrder dalam tx yang sama + memo jurnal menyebut nomor WO.
 * Journal.referenceType tetap VendorBill/Expense (F-127-V).
 * Part/material TIDAK pernah L3 — wajib L2 reopen (Putusan 3).
 */

type Client = TxClient | typeof prisma

/** Frasa penanda tunggal L3 (Putusan 4(1)). Jangan parafrase di UI. */
export const L3_MARKER = "BIAYA TELAT NON-JOB L3"
export const L3_ACTION = "late_cost_l3"

export type L3Tag = { workOrderNo: string; reason: string }

// Baris penanda baku: "BIAYA TELAT NON-JOB L3 | WO: <documentNo> | Alasan: <teks>".
// Penanda di baris PERTAMA; teks lain sesudahnya bebas catatan operator.
// Parsing manual per baris (bukan regex \s* berantai) supaya bebas backtracking
// super-linear (S8786); semantik `\s` JS (termasuk NBSP) dipetakan lewat trim.
export function parseL3Tag(text: string | null | undefined): L3Tag | null {
  if (!text) return null
  // `$`/`^` multiline regex lama berhenti di semua pemutus baris JS.
  for (const line of text.split(/\r\n|\n|\r|\u2028|\u2029/)) {
    if (!line.startsWith(L3_MARKER)) continue
    // `\s*` sesudah penanda tidak pernah menelan `|`: sesudah trim sisa wajib
    // diawali pemisah pipa; bila tidak, baris ini bukan penanda.
    let rest = line.slice(L3_MARKER.length).trimStart()
    if (!rest.startsWith("|")) continue
    rest = rest.slice(1).trimStart()
    if (!rest.startsWith("WO:")) continue
    rest = rest.slice("WO:".length).trimStart()
    // Token WO lama `(\S+)\s*\|`: run non-spasi pertama; pipa pemisah boleh
    // menempel token atau sesudah spasi. Di dalam run, pipa terakhir yang
    // diikuti `Alasan:` yang dipakai (backtracking rakus regex lama).
    const wsAt = rest.search(/\s/)
    const runEnd = wsAt === -1 ? rest.length : wsAt
    let pipeAt = -1
    for (let i = runEnd - 1; i > 0; i--) {
      if (rest[i] === "|" && rest.slice(i + 1).trimStart().startsWith("Alasan:")) {
        pipeAt = i
        break
      }
    }
    if (pipeAt === -1) {
      let j = runEnd
      while (j < rest.length && /\s/.test(rest[j])) j++
      if (rest[j] === "|" && rest.slice(j + 1).trimStart().startsWith("Alasan:")) pipeAt = j
    }
    if (pipeAt === -1) continue
    const workOrderNo = rest.slice(0, pipeAt).trimEnd()
    if (!workOrderNo || /\s/.test(workOrderNo)) continue
    const rawReason = rest.slice(pipeAt + 1).trimStart().slice("Alasan:".length)
    // Regex lama `(.+)$`: alasan wajib >= 1 karakter sesudah `Alasan:`
    // (spasi mentah pun terhitung; hasil akhir tetap di-trim pemanggil lama).
    if (rawReason.length === 0) continue
    return { workOrderNo, reason: rawReason.trim() }
  }
  return null
}

export function formatL3Tag(workOrderNo: string, reason: string): string {
  return `${L3_MARKER} | WO: ${workOrderNo} | Alasan: ${reason}`
}

export const L3_MSG = {
  missingReason: (docLabel: string) =>
    `${docLabel} bertanda L3 wajib memuat alasan klasifikasi bukan-biaya-job pada penanda (${L3_MARKER} | WO: <nomor WO> | Alasan: <alasan>). Tanpa alasan, dokumen L3 ditolak.`,
  woNotFound: (no: string) =>
    `Perintah kerja ${no} pada penanda L3 tidak ditemukan. Periksa nomor WO pada penanda.`,
  woNotClosed: (no: string, status: string) =>
    `Jalur L3 hanya untuk biaya telat sesudah perintah kerja ditutup; ${no} berstatus '${status}' (bukan closed). Biaya untuk WO yang belum ditutup dicatat lewat jalur biaya job biasa.`,
  vendorBillLinked: () =>
    `Tagihan bertanda L3 dilarang tertaut PO jasa WO atau penerimaan barang (itu jalur L1/L2 biaya job). Lepaskan tautan PO/penerimaan, atau catat biaya ini lewat reopen (L2).`,
  duplicate: (woNo: string) =>
    `Sudah ada dokumen L3 aktif untuk vendor + nominal + tanggal yang sama tertaut ${woNo}. Satu biaya telat hanya boleh dicatat satu kali; batalkan/reversal dokumen pertama sebelum mencatat dokumen pengganti.`,
  forbiddenAccountType: (code: string, group: string) =>
    `Akun ${code} bertipe ${group} adalah akun biaya job/persediaan/WIP — dilarang untuk biaya telat non-job L3 (Putusan 1 F-133-V). Pilih akun beban operasional bertipe EXPS/OEXP.`,
  forbiddenAccountSetting: (code: string) =>
    `Akun ${code} adalah akun WIP/serapan biaya job pada pengaturan sistem — dilarang untuk biaya telat non-job L3 (Putusan 1 F-133-V). Pilih akun beban operasional bertipe EXPS/OEXP.`,
  accountInactive: (code: string) =>
    `Akun ${code} tidak aktif — dokumen L3 wajib akun beban aktif bertipe EXPS/OEXP.`,
} as const

type WorkOrderRow = { id: number; documentNo: string; status: string }

/** WO pada penanda wajib ada dan closed. Return null bila tanpa penanda. */
export async function resolveL3WorkOrder(
  client: Client,
  text: string | null | undefined,
  docLabel: string,
): Promise<{ tag: L3Tag; workOrder: WorkOrderRow } | null> {
  const tag = parseL3Tag(text)
  if (!tag) return null
  if (!tag.reason) throw new Error(L3_MSG.missingReason(docLabel))
  const workOrder = await client.workOrder.findUnique({
    where: { documentNo: tag.workOrderNo },
    select: { id: true, documentNo: true, status: true },
  })
  if (!workOrder) throw new Error(L3_MSG.woNotFound(tag.workOrderNo))
  if (workOrder.status !== "closed") {
    throw new Error(L3_MSG.woNotClosed(workOrder.documentNo, workOrder.status))
  }
  return { tag, workOrder }
}

const FORBIDDEN_GROUPS = new Set(["COGS", "INTR"])

/**
 * Putusan 1(b): Expense L3 wajib akun EXPS/OEXP aktif; tolak COGS/INTR
 * (penjaga tipe COA) dan akun WIP/serapan dari setting existing
 * (wipAccountId/materialExpenseAccountId/cogsAccountId/
 * materialIssueExpenseAccountId bila terisi di SystemSetting).
 */
export async function assertExpenseL3AccountAllowed(
  client: Client,
  accountId: number,
): Promise<void> {
  const account = await client.account.findUnique({
    where: { id: accountId },
    select: { code: true, reportGroup: true, isActive: true },
  })
  if (!account) throw new Error(`Akun beban pengeluaran (id: ${accountId}) tidak ditemukan.`)
  if (!account.isActive) throw new Error(L3_MSG.accountInactive(account.code))
  const group = (account.reportGroup ?? "").toUpperCase()
  if (FORBIDDEN_GROUPS.has(group)) {
    throw new Error(L3_MSG.forbiddenAccountType(account.code, group))
  }
  const setting = await client.systemSetting.findFirst({
    select: {
      wipAccountId: true,
      materialExpenseAccountId: true,
      cogsAccountId: true,
      materialIssueExpenseAccountId: true,
    },
  })
  const jobAccountIds = new Set(
    [
      setting?.wipAccountId,
      setting?.materialExpenseAccountId,
      setting?.cogsAccountId,
      setting?.materialIssueExpenseAccountId,
    ].filter((v): v is number => v != null),
  )
  if (jobAccountIds.has(accountId)) {
    throw new Error(L3_MSG.forbiddenAccountSetting(account.code))
  }
}

/**
 * Putusan 2: satu biaya telat = satu dokumen sumber. Duplikat =
 * ActivityLog L3 aktif pada WO sama dengan vendor+nominal+tanggal sama.
 * Dokumen pertama batal/reversed (status cancelled/rejected atau jurnal
 * REVERSED) tidak menghalangi dokumen pengganti.
 */
export async function assertNoDuplicateL3(
  client: Client,
  input: {
    workOrderId: number
    workOrderNo: string
    vendorKey: string
    amount: number
    date: Date
    excludeSource?: { sourceType: "VendorBill" | "Expense"; sourceId: number }
  },
): Promise<void> {
  const logs = await client.activityLog.findMany({
    where: { modelType: "WorkOrder", modelId: input.workOrderId, action: L3_ACTION },
    select: { metadata: true },
  })
  const day = input.date.toISOString().slice(0, 10)
  for (const log of logs) {
    if (!log.metadata) continue
    let meta: Record<string, unknown>
    try {
      meta = JSON.parse(log.metadata) as Record<string, unknown>
    } catch {
      continue
    }
    if (meta.vendorKey !== input.vendorKey) continue
    if (Math.abs(Number(meta.amount) - input.amount) > 0.005) continue
    if (String(meta.date ?? "").slice(0, 10) !== day) continue
    if (
      input.excludeSource &&
      meta.sourceType === input.excludeSource.sourceType &&
      Number(meta.sourceId) === input.excludeSource.sourceId
    ) {
      continue
    }
    const active = await isL3SourceActive(client, String(meta.sourceType), Number(meta.sourceId))
    if (active) throw new Error(L3_MSG.duplicate(input.workOrderNo))
  }
}

async function isL3SourceActive(
  client: Client,
  sourceType: string,
  sourceId: number,
): Promise<boolean> {
  if (sourceType === "VendorBill") {
    const bill = await client.vendorBill.findUnique({
      where: { id: sourceId },
      select: { status: true, deletedAt: true },
    })
    if (!bill || bill.deletedAt || bill.status === "cancelled") return false
  } else if (sourceType === "Expense") {
    const expense = await client.expense.findUnique({
      where: { id: sourceId },
      select: { status: true },
    })
    if (!expense || expense.status === "rejected" || expense.status === "cancelled") return false
  } else {
    return false
  }
  const journal = await client.journal.findFirst({
    where: { referenceType: sourceType, referenceId: sourceId },
    select: { status: true },
  })
  // Jurnal ter-reversal = dokumen sudah dikoreksi; pengganti boleh lahir.
  if (journal && journal.status === "REVERSED") return false
  return true
}

/** Putusan 4(2): jejak L3 pada WO, ditulis pemanggil dalam tx dokumen. */
export async function writeL3ActivityLog(
  client: Client,
  input: {
    workOrder: WorkOrderRow
    sourceType: "VendorBill" | "Expense"
    sourceId: number
    sourceDocumentNo: string
    vendorKey: string
    amount: number
    date: Date
    reason: string
    userId: number | null
  },
): Promise<void> {
  await client.activityLog.create({
    data: {
      userId: input.userId,
      action: L3_ACTION,
      modelType: "WorkOrder",
      modelId: input.workOrder.id,
      description:
        `${L3_MARKER}: ${input.sourceType} ${input.sourceDocumentNo} tertaut ` +
        `${input.workOrder.documentNo} (beban periode berjalan, bukan biaya job). ` +
        `Alasan: ${input.reason}`,
      metadata: JSON.stringify({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceDocumentNo: input.sourceDocumentNo,
        workOrderNo: input.workOrder.documentNo,
        vendorKey: input.vendorKey,
        amount: input.amount,
        date: input.date.toISOString().slice(0, 10),
        reason: input.reason,
      }),
    },
  })
}
