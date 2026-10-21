import { prisma, TxClient } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { safeAdd, safeMultiply } from "@/lib/utils/math"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { JournalService } from "@/lib/services/journal.service"
import { decideWarrantyClaimAccounting } from "@/lib/services/warranty-accounting"

/**
 * F-2026-10-21-021 tahap 3 — pemanggil jurnal garansi, RUTE PROVISI MATI.
 *
 * Vonis BOT 4 (backlog §0-§9 + LANJUTAN §3) + PUTUSAN G1 Lead: hanya dua
 * peristiwa yang boleh lahir di sini:
 * - E2 `WarrantyClaimCost` (referenceId = claimId): biaya klaim covered saat
 *   terjadi, SELURUHNYA ke 510104 Beban Garansi (saldo provisi selalu 0 di
 *   rute ini). E1 akrual / E4 pelepasan provisi TIDAK dibangun dan TIDAK
 *   disaklarkan — menunggu gerbang data 12 bulan/30 klaim dinilai BOT 4.
 * - E3 `WarrantySupplierRecovery` (referenceId = claimId): recovery supplier
 *   virtually-certain saja (status accepted/closed_recovered + bukti lampiran
 *   TransactionAttachment "WarrantyClaim"): Dr 110508 / Cr 510104. Recovery
 *   `possible` = aset kontinjensi, TANPA jurnal (PSAK 57 par 31-35).
 *
 * Bentuk kredit E2 (keputusan teknis BOT 3, dilaporkan ke BOT 4/BOT 6):
 * MaterialIssue completed SUDAH dijurnal hook existing
 * (Dr Beban Material / Cr Persediaan, nilai FIFO), dan ProductionCost WO
 * tanpa production order tidak melahirkan jurnal beban sendiri. Mengkredit
 * Persediaan lagi di E2 = biaya dobel. Karena itu E2 adalah REKLASIFIKASI
 * beban yang sudah tercatat: Dr 510104 / Cr akun beban material efektif
 * (materialIssueExpense → materialExpense → cogs, rumus yang sama dengan
 * hook MaterialIssue). Total beban GL tidak berubah; yang berubah hanya
 * klasifikasi biaya klaim menjadi Beban Garansi, sesuai AC-G4 vonis
 * (seluruh biaya ke 510104, nol baris 210205).
 * ponytail: satu akun kredit untuk campuran part+jasa karena ProductionCost
 * tidak punya kolom akun sumber; tambah akun per baris biaya bila finance
 * butuh pisah kredit part vs jasa.
 *
 * Setiap pemanggil: assertPeriodOpen + cek anti-dobel (referenceType,
 * referenceId; jurnal POSTED non-REVERSED) + resolusi mapping fail-closed,
 * semua di DALAM satu transaksi pemanggil. Tanggal jurnal = tanggal
 * peristiwa bisnis dari pemanggil, tidak digeser diam-diam.
 */

export const WARRANTY_CLAIM_COST_REF = "WarrantyClaimCost"
export const WARRANTY_SUPPLIER_RECOVERY_REF = "WarrantySupplierRecovery"

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100

export interface WarrantyRepairCost {
  materialCost: number
  productionCost: number
  total: number
}

/**
 * Biaya klaim terverifikasi sistem (gerbang G4 vonis): HANYA dari WO repair
 * tertaut — MaterialIssue completed (Σ qty × cost baris, snapshot FIFO) +
 * ProductionCost WO repair. Angka ketik bebas tidak pernah jadi biaya E2/E3.
 */
export async function computeWarrantyRepairCost(
  repairWorkOrderId: number,
  client: TxClient | typeof prisma = prisma,
): Promise<WarrantyRepairCost> {
  const [issues, costs] = await Promise.all([
    client.materialIssue.findMany({
      where: { workOrderId: repairWorkOrderId, status: "completed" },
      select: { items: { select: { qty: true, cost: true } } },
    }),
    client.productionCost.findMany({
      where: { workOrderId: repairWorkOrderId },
      select: { amount: true },
    }),
  ])
  const materialCost = issues.reduce(
    (sum, mi) =>
      mi.items.reduce((s, item) => safeAdd(s, safeMultiply(Number(item.qty), Number(item.cost), 2), 2), sum),
    0,
  )
  const productionCost = costs.reduce((s, c) => safeAdd(s, Number(c.amount), 2), 0)
  return { materialCost, productionCost, total: safeAdd(materialCost, productionCost, 2) }
}

interface WarrantyJournalSettings {
  warrantyExpenseAccountId: number | null
  supplierClaimReceivableAccountId: number | null
  materialIssueExpenseAccountId: number | null
  materialExpenseAccountId: number | null
  cogsAccountId: number | null
}

async function loadSettingsInTx(tx: TxClient): Promise<WarrantyJournalSettings> {
  const s = await tx.systemSetting.findFirst({
    select: {
      warrantyExpenseAccountId: true,
      supplierClaimReceivableAccountId: true,
      materialIssueExpenseAccountId: true,
      materialExpenseAccountId: true,
      cogsAccountId: true,
    },
  })
  return {
    warrantyExpenseAccountId: s?.warrantyExpenseAccountId ?? null,
    supplierClaimReceivableAccountId: s?.supplierClaimReceivableAccountId ?? null,
    materialIssueExpenseAccountId: s?.materialIssueExpenseAccountId ?? null,
    materialExpenseAccountId: s?.materialExpenseAccountId ?? null,
    cogsAccountId: s?.cogsAccountId ?? null,
  }
}

/** Akun harus ada, aktif, dan bukan induk header (punya anak) — vonis §0.4. */
async function assertPostableAccount(tx: TxClient, accountId: number, label: string): Promise<void> {
  const account = await tx.account.findFirst({
    where: { id: accountId, deletedAt: null },
    select: { id: true, isActive: true, _count: { select: { children: true } } },
  })
  if (!account) throw new Error(`Akun ${label} yang dimapping tidak ditemukan — perbaiki mapping di Pengaturan Akuntansi.`)
  if (!account.isActive) throw new Error(`Akun ${label} yang dimapping tidak aktif — posting garansi ditolak.`)
  if (account._count.children > 0) {
    throw new Error(`Akun ${label} yang dimapping adalah akun induk — pilih akun anak yang terposting.`)
  }
}

async function assertNoExistingJournal(
  tx: TxClient,
  referenceType: string,
  referenceId: number,
  label: string,
): Promise<void> {
  const existing = await tx.journal.findFirst({
    where: { referenceType, referenceId, status: "POSTED", deletedAt: null },
    select: { id: true, journalNumber: true },
  })
  if (existing) {
    throw new Error(
      `${label} untuk dokumen ini sudah diposting (jurnal ${existing.journalNumber ?? `#${existing.id}`}) — posting dobel ditolak.`,
    )
  }
}

async function loadClaimInTx(tx: TxClient, claimId: number) {
  await tx.$queryRaw`SELECT id FROM warranty_claims WHERE id = ${claimId} FOR UPDATE`
  const claim = await tx.warrantyClaim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      status: true,
      decisionBy: true,
      decisionAt: true,
      repairWorkOrderId: true,
      supplierClaimStatus: true,
      coverage: { select: { expiresAt: true } },
      reportedAt: true,
    },
  })
  if (!claim) throw new Error("Klaim garansi tidak ditemukan.")
  return claim
}

/**
 * E2 — realisasi biaya klaim covered (rute MATI: seluruh biaya ke 510104).
 * Syarat: klaim approved/in_repair/closed dengan keputusan tercatat, WO
 * repair tertaut, dan biaya terverifikasi > 0. Klaim rejected / tanpa WO
 * repair / biaya nol = TANPA jurnal (bukan error operasional biasa — pesan
 * jelas supaya operator tahu tidak ada yang diposting).
 */
export async function postWarrantyClaimCostJournal(
  input: { claimId: number; eventDate: Date; createdBy?: number | null },
): Promise<{ journalId: number; journalNumber: string; amount: number }> {
  return prisma.$transaction(async (tx) => {
    const claim = await loadClaimInTx(tx, input.claimId)
    if (!["approved", "in_repair", "closed"].includes(claim.status) || claim.decisionBy == null || claim.decisionAt == null) {
      throw new Error("Jurnal biaya garansi hanya untuk klaim yang sudah disetujui dengan keputusan tercatat.")
    }
    if (claim.repairWorkOrderId == null) {
      throw new Error("Klaim belum tertaut ke WO repair — jurnal biaya garansi tidak dapat diposting.")
    }

    const cost = await computeWarrantyRepairCost(claim.repairWorkOrderId, tx)
    if (cost.total <= 0) {
      throw new Error("Biaya WO repair terverifikasi nol — tidak ada jurnal biaya garansi yang diposting.")
    }

    // Mesin F-49 (jangan diubah tanpa BOT 4): rute MATI memanggilnya dengan
    // provisionBalance 0 secara eksplisit, jadi seluruh biaya ke Beban Garansi.
    const decision = decideWarrantyClaimAccounting({
      withinWarranty: claim.reportedAt.getTime() <= claim.coverage.expiresAt.getTime(),
      coverage: "part",
      kind: "assurance",
      claimApproved: true,
      reworkCost: cost.total,
      provisionBalance: 0,
      supplierRecovery: "none",
      supplierRecoveryAmount: 0,
    })
    if (decision.path !== "covered_warranty" || !decision.invoiceForbidden) {
      throw new Error("Klaim ini tidak berada di jalur garansi covered — jurnal biaya garansi ditolak.")
    }

    const settings = await loadSettingsInTx(tx)
    if (!settings.warrantyExpenseAccountId) {
      throw new Error(
        "Akun Beban Garansi (510104) belum dimapping di Pengaturan Akuntansi (warrantyExpenseAccountId) — posting biaya garansi ditolak.",
      )
    }
    const sourceAccountId =
      settings.materialIssueExpenseAccountId ?? settings.materialExpenseAccountId ?? settings.cogsAccountId
    if (!sourceAccountId) {
      throw new Error("Akun beban material/HPP belum dimapping — posting biaya garansi ditolak.")
    }
    await assertPostableAccount(tx, settings.warrantyExpenseAccountId, "Beban Garansi")
    await assertPostableAccount(tx, sourceAccountId, "beban material/HPP")

    await assertPeriodOpen(input.eventDate, tx)
    await assertNoExistingJournal(tx, WARRANTY_CLAIM_COST_REF, claim.id, "Jurnal biaya garansi")

    const journalNumber = await generateDocumentNumber("JRN")
    const journal = await new JournalService(tx as never).createJournal({
      journalNumber,
      transactionDate: input.eventDate,
      referenceType: WARRANTY_CLAIM_COST_REF,
      referenceId: claim.id,
      type: "GENERAL",
      description: `Biaya klaim garansi #${claim.id} (WO repair #${claim.repairWorkOrderId})`,
      createdBy: input.createdBy ?? undefined,
      entries: [
        {
          accountId: settings.warrantyExpenseAccountId,
          debit: cost.total,
          credit: 0,
          memo: "Beban garansi — biaya klaim saat terjadi (provisi MATI)",
        },
        {
          accountId: sourceAccountId,
          debit: 0,
          credit: cost.total,
          memo: "Reklasifikasi beban sumber WO repair — biaya klaim garansi",
        },
      ],
    })
    return { journalId: journal.id, journalNumber: journal.journalNumber, amount: cost.total }
  })
}

/**
 * E3 — recovery supplier virtually-certain. Syarat: klaim supplier
 * accepted/closed_recovered, bukti persetujuan supplier terlampir
 * (TransactionAttachment referenceType "WarrantyClaim"), nominal > 0 dan
 * tidak melebihi biaya klaim terverifikasi. Status operasional lain
 * (termasuk `possible`) = tanpa jurnal.
 */
export async function postWarrantySupplierRecoveryJournal(
  input: { claimId: number; amount: number; eventDate: Date; createdBy?: number | null },
): Promise<{ journalId: number; journalNumber: string; amount: number }> {
  const amount = round2(input.amount)
  if (!(amount > 0)) throw new Error("Nominal recovery supplier harus lebih dari nol.")
  return prisma.$transaction(async (tx) => {
    const claim = await loadClaimInTx(tx, input.claimId)
    if (!["accepted", "closed_recovered"].includes(claim.supplierClaimStatus)) {
      throw new Error(
        "Recovery supplier hanya dijurnal bila klaim supplier sudah diterima (accepted/closed_recovered) — status lain belum hampir pasti, tanpa jurnal.",
      )
    }
    const evidenceCount = await tx.transactionAttachment.count({
      where: { referenceType: "WarrantyClaim", referenceId: claim.id },
    })
    if (evidenceCount === 0) {
      throw new Error("Bukti persetujuan supplier wajib dilampirkan pada klaim sebelum recovery dijurnal.")
    }
    if (claim.repairWorkOrderId == null) {
      throw new Error("Klaim belum tertaut ke WO repair — biaya klaim tidak dapat diverifikasi untuk recovery.")
    }
    const cost = await computeWarrantyRepairCost(claim.repairWorkOrderId, tx)
    if (amount > cost.total) {
      throw new Error(
        `Nominal recovery (${amount}) melebihi biaya klaim terverifikasi (${cost.total}) — recovery dibatasi sebesar biaya.`,
      )
    }

    const settings = await loadSettingsInTx(tx)
    if (!settings.supplierClaimReceivableAccountId || !settings.warrantyExpenseAccountId) {
      throw new Error(
        "Akun Piutang Klaim Supplier (110508) dan Beban Garansi (510104) belum dimapping di Pengaturan Akuntansi — posting recovery garansi ditolak.",
      )
    }
    await assertPostableAccount(tx, settings.supplierClaimReceivableAccountId, "Piutang Klaim Supplier")
    await assertPostableAccount(tx, settings.warrantyExpenseAccountId, "Beban Garansi")

    await assertPeriodOpen(input.eventDate, tx)
    await assertNoExistingJournal(tx, WARRANTY_SUPPLIER_RECOVERY_REF, claim.id, "Jurnal recovery supplier")

    const journalNumber = await generateDocumentNumber("JRN")
    const journal = await new JournalService(tx as never).createJournal({
      journalNumber,
      transactionDate: input.eventDate,
      referenceType: WARRANTY_SUPPLIER_RECOVERY_REF,
      referenceId: claim.id,
      type: "GENERAL",
      description: `Recovery klaim supplier garansi #${claim.id}`,
      createdBy: input.createdBy ?? undefined,
      entries: [
        {
          accountId: settings.supplierClaimReceivableAccountId,
          debit: amount,
          credit: 0,
          memo: "Piutang klaim supplier — garansi (hampir pasti, PSAK 57)",
        },
        {
          accountId: settings.warrantyExpenseAccountId,
          debit: 0,
          credit: amount,
          memo: "Pemulihan biaya garansi dari supplier (bukan pendapatan)",
        },
      ],
    })
    return { journalId: journal.id, journalNumber: journal.journalNumber, amount }
  })
}

/**
 * Guard invoiceForbidden (gerbang G5, ditegakkan di SERVER): WO repair milik
 * klaim garansi covered (keputusan approved tercatat) tidak boleh melahirkan
 * SalesInvoice lewat jembatan quotation/project/sales-order apa pun.
 * Mengembalikan pesan penolakan atau null bila aman. Murni baca — pemanggil
 * menjalankannya di dalam transaksinya sendiri.
 */
export async function findWarrantyRepairInvoiceBlock(
  client: TxClient | typeof prisma,
  input: { quotationId?: number | null; projectId?: number | null; salesOrderId?: number | null },
): Promise<string | null> {
  let workOrderIds: number[] = []
  if (input.salesOrderId != null) {
    const so = await client.salesOrder.findUnique({
      where: { id: input.salesOrderId },
      select: { quotationId: true },
    })
    if (so?.quotationId != null) {
      const wos = await client.workOrder.findMany({ where: { quotationId: so.quotationId }, select: { id: true } })
      workOrderIds = wos.map((w) => w.id)
    }
  }
  const or: Record<string, unknown>[] = []
  if (input.quotationId != null) or.push({ quotationId: input.quotationId })
  if (input.projectId != null) or.push({ projectId: input.projectId })
  if (or.length > 0) {
    const wos = await client.workOrder.findMany({ where: { OR: or }, select: { id: true } })
    workOrderIds = [...new Set([...workOrderIds, ...wos.map((w) => w.id)])]
  }
  if (workOrderIds.length === 0) return null

  const claim = await client.warrantyClaim.findFirst({
    where: {
      repairWorkOrderId: { in: workOrderIds },
      status: { in: ["approved", "in_repair", "closed"] },
      decisionBy: { not: null },
    },
    select: { id: true, repairWorkOrderId: true },
  })
  if (!claim) return null
  return (
    `WO repair #${claim.repairWorkOrderId} adalah pekerjaan garansi covered (klaim #${claim.id}) — ` +
    "SalesInvoice dilarang untuk pekerjaan ini (risiko tertagih dobel). Pekerjaan tertagih wajib lewat WO + invoice baru terpisah."
  )
}

/** Lempar bila WO adalah WO repair garansi covered — untuk titik lahir invoice. */
export async function assertInvoiceAllowedForWorkOrderBridges(
  client: TxClient | typeof prisma,
  input: { quotationId?: number | null; projectId?: number | null; salesOrderId?: number | null },
): Promise<void> {
  const block = await findWarrantyRepairInvoiceBlock(client, input)
  if (block) throw new Error(block)
}
