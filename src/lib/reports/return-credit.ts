/**
 * F-2026-10-23-104-V Putusan 2 (BR-RET-02): returnCredit per faktur asal.
 *
 * Satu-satunya derivation: Σ kaki Cr akun Piutang (`salesReceivableAccountId`)
 * jurnal SalesReturn POSTED tidak-terhapus atas SalesReturn `completed`
 * ber-`salesInvoiceId` faktur itu. Jurnal REVERSED tidak dihitung (filter
 * status POSTED) — tetap POSTED-saja (TASK-022): jurnal lawan reversal
 * ber-referenceType "Journal", bukan "SalesReturn", sehingga tersaring
 * keluar; memasukkan REVERSED akan menghitung asli tanpa lawannya dan
 * penjumlahan satu-sisi (kredit saja) tidak akan neto nol.
 * Neto nol hanya untuk pasangan reversal satu tingkat. TASK-025:
 * reversal ganda ditolak di sumber (jurnal ber-referenceType "Journal"
 * tidak boleh di-reverse lagi), jadi batas satu tingkat ini ditegakkan
 * di jalur generik, bukan hanya diasumsikan. `paidAmount` kolom TIDAK pernah diubah helper ini —
 * definisi pembayaran tetap murni (vonis); outstanding baru =
 * grandTotal − paidAmount − returnCredit.
 *
 * Akun Piutang belum terkonfigurasi / settings gagal → semua 0 (pola
 * sales-target-achievement-data): laporan tetap jalan, retur tidak tampil
 * sebagai pengurang. Dipakai bersama loader statement, aging, ringkasan
 * AR/AP, antrean penagihan, dan gerbang kredit (S-1 PR #1072) — jangan
 * salin-tempel query jurnal.
 *
 * Inti `*WithClient` menerima client apa pun (prisma global ATAU client tx
 * pemanggil) supaya derivation yang sama berlaku di dalam transaksi lahir;
 * versi tanpa akhiran = bungkus prisma global existing. Resolusi akun
 * Piutang: pemanggil global meneruskan hasil `getSystemSettings()`; jalur
 * tx membiarkan inti membaca `systemSetting` dari client yang sama (konsisten
 * dengan snapshot transaksi), persis perilaku gerbang sebelum ekstraksi.
 */

import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"
import { safeAdd } from "@/lib/utils/math"

type ReturnCreditClient = Prisma.TransactionClient | typeof prisma

async function resolveReceivableAccountId(
  client: ReturnCreditClient,
): Promise<number | null> {
  const settings = await client.systemSetting.findFirst({
    select: { salesReceivableAccountId: true },
  })
  return settings?.salesReceivableAccountId ?? null
}

async function receivableAccountIdForGlobal(): Promise<number | null> {
  try {
    return (await getSystemSettings())?.salesReceivableAccountId ?? null
  } catch {
    return null
  }
}

/**
 * Map salesReturnId → returnCredit retur itu (Rp, presisi sen), dari kaki
 * Cr Piutang jurnal SalesReturn POSTED retur tersebut. Retur tanpa jurnal
 * POSTED tidak muncul di map (anggap 0).
 *
 * `receivableAccountId` diteruskan pemanggil global (hasil
 * `getSystemSettings()`); kosong → inti membaca `systemSetting` dari client.
 */
export async function loadReturnCreditByReturnIdWithClient(
  client: ReturnCreditClient,
  returnIds: readonly number[],
  receivableAccountId?: number | null,
): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  if (returnIds.length === 0) return result

  const accountId =
    receivableAccountId === undefined
      ? await resolveReceivableAccountId(client)
      : receivableAccountId
  if (accountId === null) return result

  const journals = await client.journal.findMany({
    where: {
      deletedAt: null,
      status: "POSTED",
      referenceType: "SalesReturn",
      referenceId: { in: [...returnIds] },
    },
    select: {
      referenceId: true,
      entries: {
        where: { accountId },
        select: { credit: true },
      },
    },
  })
  for (const journal of journals) {
    if (journal.referenceId === null) continue
    let credit = 0
    for (const entry of journal.entries) credit = safeAdd(credit, Number(entry.credit), 2)
    if (credit <= 0) continue
    result.set(journal.referenceId, safeAdd(result.get(journal.referenceId) ?? 0, credit, 2))
  }
  return result
}

/**
 * Map salesInvoiceId → returnCredit total (Rp, presisi sen).
 * Faktur tanpa retur POSTED tidak muncul di map (anggap 0).
 */
export async function loadReturnCreditByInvoiceIdWithClient(
  client: ReturnCreditClient,
  invoiceIds: readonly number[],
  receivableAccountId?: number | null,
): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  if (invoiceIds.length === 0) return result

  const returns = await client.salesReturn.findMany({
    where: { status: "completed", salesInvoiceId: { in: [...invoiceIds] } },
    select: { id: true, salesInvoiceId: true },
  })
  if (returns.length === 0) return result

  const invoiceByReturnId = new Map(returns.map((r) => [r.id, r.salesInvoiceId as number]))
  const byReturnId = await loadReturnCreditByReturnIdWithClient(
    client,
    returns.map((r) => r.id),
    receivableAccountId,
  )
  for (const [returnId, credit] of byReturnId) {
    const invoiceId = invoiceByReturnId.get(returnId)
    if (invoiceId === undefined) continue
    result.set(invoiceId, safeAdd(result.get(invoiceId) ?? 0, credit, 2))
  }
  return result
}

export async function loadReturnCreditByReturnId(
  returnIds: readonly number[],
): Promise<Map<number, number>> {
  if (returnIds.length === 0) return new Map()
  return loadReturnCreditByReturnIdWithClient(
    prisma,
    returnIds,
    await receivableAccountIdForGlobal(),
  )
}

export async function loadReturnCreditByInvoiceId(
  invoiceIds: readonly number[],
): Promise<Map<number, number>> {
  if (invoiceIds.length === 0) return new Map()
  return loadReturnCreditByInvoiceIdWithClient(
    prisma,
    invoiceIds,
    await receivableAccountIdForGlobal(),
  )
}
