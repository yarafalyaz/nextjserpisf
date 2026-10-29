/**
 * Subledger utang komisi tahap 3 (vonis R-komisi-vonispayable §2–§5).
 *
 * - accrueTx: dipanggil saat transisi faktur → paid. Satu tx = snapshot +
 *   baris subledger + jurnal Dr beban / Cr utang. Syarat lahir: penjual
 *   tidak null, snapshot persen ada, hasil > 0, mapping lengkap. Satu syarat
 *   gagal = nol baris + nol jurnal berlabel alasan (faktur tetap paid).
 * - reverseTx: lawan retur completed. Penjaga kumulatif R ≤ A dalam tx.
 * - paidTx: tautan bayar via slip payroll (P ≤ A − R, kecuali retur-sesudah-bayar).
 * - cancelAccrualTx: un-accrue saat faktur turun status dari paid. Batal
 *   sesudah paid = reversal penuh (vonis §6): jurnal lawan penuh senilai
 *   akrual yang belum direversal retur, lalu reversalAmount = accrued agar
 *   saldo A−R−P = 0 dan status turunan REVERSED (§7). Baris TIDAK dihapus.
 *
 * Jurnal memakai claim ref `CommissionPayableAccrual/<invoiceId>` agar
 * replay pembayaran terakhir idempoten (tak ada baris/jurnal kedua).
 */

import { Prisma } from "@prisma/client"

import type { TxClient } from "@/lib/db/prisma"
import { assertJournalClaimRef } from "@/lib/hooks/accounting.hook"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { safeMultiply, safeRound, safeSubtract } from "@/lib/utils/math"

export const COMMISSION_ACCRUAL_JOURNAL_REF = "CommissionPayableAccrual"
export const COMMISSION_REVERSAL_JOURNAL_REF = "CommissionPayableReversal"
export const COMMISSION_CANCELLATION_JOURNAL_REF = "CommissionPayableCancellation"

export interface CommissionAccrueOutcome {
  accrued: boolean
  amount: number
  reason: string | null
}

async function journalNumber(tx: TxClient, prefix: string, refId: number): Promise<string> {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)
  return `${prefix}/${refId}/${ts}`
}

/**
 * Validasi mapping akun komisi: fail-closed berisik bila kosong, nonaktif,
 * salah tipe, atau debit == kredit (vonis §4).
 */
async function resolveCommissionAccounts(tx: TxClient): Promise<{ expenseId: number; payableId: number }> {
  const settings = await tx.systemSetting.findFirst()
  if (!settings) throw new Error("Pengaturan sistem belum dikonfigurasi.")
  const expenseId = settings.commissionExpenseAccountId
  const payableId = settings.commissionPayableAccountId
  if (!expenseId || !payableId) {
    throw new Error(
      "Akrual komisi ditolak: mapping akun komisi belum lengkap di Pengaturan (Pengaturan → Akun). " +
        "Isi akun Beban Komisi dan Utang Komisi Penjualan — tidak ada fallback.",
    )
  }
  if (expenseId === payableId) {
    throw new Error("Akrual komisi ditolak: akun beban dan utang komisi tidak boleh sama.")
  }
  const accounts = await tx.account.findMany({
    where: { id: { in: [expenseId, payableId] } },
    select: { id: true, code: true, reportGroup: true, isActive: true },
  })
  const expense = accounts.find((a) => a.id === expenseId)
  const payable = accounts.find((a) => a.id === payableId)
  if (!expense || !payable) {
    throw new Error("Akrual komisi ditolak: akun komisi tidak ditemukan. Pilih ulang akun sebelum posting.")
  }
  if (!expense.isActive || !payable.isActive) {
    throw new Error("Akrual komisi ditolak: akun komisi nonaktif. Aktifkan dulu di COA.")
  }
  // Beban komisi wajib grup beban (EXPS; instalasi lama berlabel BEBAN).
  // Mapping tertukar ke akun neraca/pendapatan = jurnal akrual membukukan
  // beban ke kaki salah.
  if (expense.reportGroup !== "EXPS" && expense.reportGroup !== "BEBAN") {
    throw new Error(
      `Akrual komisi ditolak: akun beban komisi harus grup beban EXPS (dapat ${expense.reportGroup ?? "?"}).`,
    )
  }
  if (payable.reportGroup !== "OCLY") {
    throw new Error(
      `Akrual komisi ditolak: akun utang komisi harus tipe OCLY (dapat ${payable.reportGroup ?? "?"}).`,
    )
  }
  return { expenseId, payableId }
}

/**
 * Kunci baris subledger (atau sales_invoice sebagai gerbang lahir) agar
 * accrue/reverse/paid konkuren serial: dua tx membaca saldo yang sama lalu
 * sama-sama menulis = tulis ganda/last-write-wins. Pola sama inventory-fifo:
 * guard `$executeRaw` supaya mock tx ringan tetap jalan.
 */
async function lockPayableRow(tx: TxClient, salesInvoiceId: number): Promise<void> {
  if (typeof tx.$executeRaw === "function") {
    await tx.$executeRaw`SELECT id FROM commission_payables WHERE sales_invoice_id = ${salesInvoiceId} FOR UPDATE`
  }
}

async function lockInvoiceRow(tx: TxClient, salesInvoiceId: number): Promise<void> {
  if (typeof tx.$executeRaw === "function") {
    await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${salesInvoiceId} FOR UPDATE`
  }
}

/**
 * Akrual utang komisi saat faktur lunas. Idempoten: baris existing =
 * no-op. Wajib dipanggil DALAM tx transisi paid pemanggil.
 */
export async function accrueTx(
  tx: TxClient,
  salesInvoiceId: number,
  userId?: number | null,
  known?: { status?: unknown; salesEmployeeId?: unknown; commissionRatePercent?: unknown; grandTotal?: unknown; taxAmount?: unknown; updatedAt?: unknown; documentNo?: unknown; date?: unknown } | null,
): Promise<CommissionAccrueOutcome> {
  assertJournalClaimRef(COMMISSION_ACCRUAL_JOURNAL_REF, salesInvoiceId)
  await lockPayableRow(tx, salesInvoiceId)
  await lockInvoiceRow(tx, salesInvoiceId)

  const existing = await tx.commissionPayable.findFirst({ where: { salesInvoiceId } })
  if (existing) return { accrued: true, amount: Number(existing.accruedAmount), reason: null }

  // Pemanggil (recalcCore) sudah membaca invoice — pakai yang diketahui bila
  // ada supaya tanpa query ganda (mock `mockResolvedValueOnce` + hemat 1 round-trip).
  const invoice =
    known != null
      ? (known as { status: unknown; salesEmployeeId: unknown; commissionRatePercent: unknown; grandTotal: unknown; taxAmount: unknown; updatedAt: unknown; documentNo: unknown; date: unknown })
      : await tx.salesInvoice.findUniqueOrThrow({ where: { id: salesInvoiceId } })
  if (invoice.status !== "paid") return { accrued: false, amount: 0, reason: "faktur-belum-paid" }
  if (invoice.salesEmployeeId == null) return { accrued: false, amount: 0, reason: "penjual-null" }
  const percent = invoice.commissionRatePercent == null ? null : Number(invoice.commissionRatePercent)
  if (percent == null) return { accrued: false, amount: 0, reason: "snapshot-null" }
  if (!(percent > 0)) return { accrued: false, amount: 0, reason: "persen-nol" }

  // Basis = DPP snapshot = grandTotal − taxAmount (vonis §1, BR-KT36-05).
  const dpp = safeRound(Number(invoice.grandTotal ?? 0) - Number(invoice.taxAmount ?? 0), 2)
  const amount = safeRound(safeMultiply(dpp, percent, 4) / 100, 2)
  if (!(amount > 0)) return { accrued: false, amount: 0, reason: "hasil-nol" }

  // Preflight WAJIB sebelum tulis apa pun (fix catch-telan hook): hook
  // menelan galat akrual agar faktur tetap paid (vonis §5), jadi gagal
  // tengah-tulis = jurnal yatim / baris tanpa jurnal. Semua prasyarat
  // yang bisa gagal (mapping+tipe akun, klaim+jurnal existing, periode)
  // divalidasi SEBELUM create pertama; sesudah itu hanya create berurutan.
  const { expenseId, payableId } = await resolveCommissionAccounts(tx)
  const priorJournal = await tx.journal.findFirst({
    where: { referenceType: COMMISSION_ACCRUAL_JOURNAL_REF, referenceId: salesInvoiceId },
    select: { id: true },
  })
  if (priorJournal) {
    throw new Error(
      `Akrual komisi ditolak: jurnal akrual faktur #${salesInvoiceId} sudah ada (#${priorJournal.id}) tanpa baris subledger — perlu resolusi manual, bukan jurnal kedua.`,
    )
  }
  // Tanggal jurnal = tanggal transisi paid (vonis §5), bukan updatedAt faktur
  // (berubah tiap edit) dan bukan tanggal terbit faktur.
  const txDate = new Date()
  await assertPeriodOpen(txDate, tx)

  const journal = await tx.journal.create({
    data: {
      journalNumber: await journalNumber(tx, "KMS", salesInvoiceId),
      transactionDate: txDate,
      referenceType: COMMISSION_ACCRUAL_JOURNAL_REF,
      referenceId: salesInvoiceId,
      description: `Akrual komisi faktur ${invoice.documentNo ?? salesInvoiceId}`,
      type: "GENERAL",
      status: "POSTED",
      totalDebit: amount,
      totalCredit: amount,
      createdBy: userId ?? null,
    },
  })
  await tx.journalEntry.createMany({
    data: [
      { journalId: journal.id, accountId: expenseId, debit: amount, credit: 0, memo: "Beban komisi penjualan" },
      { journalId: journal.id, accountId: payableId, debit: 0, credit: amount, memo: "Utang komisi penjualan" },
    ],
  })
  await tx.commissionPayable.create({
    data: {
      salesInvoiceId,
      salesEmployeeId: Number(invoice.salesEmployeeId),
      accruedAmount: new Prisma.Decimal(amount.toFixed(2)),
      accrualJournalId: journal.id,
      createdBy: userId ?? null,
    },
  })
  return { accrued: true, amount, reason: null }
}

export interface CommissionCancelOutcome {
  cancelled: boolean
  amount: number
  reason: string | null
}

/**
 * Un-accrue: faktur turun status dari paid (bayar dihapus/direversal).
 * Vonis §6 "dibatalkan sesudah paid = reversal penuh": jurnal lawan Dr
 * utang / Cr beban senilai sisa akrual (accrued − reversal retur), jurnal
 * asal ditandai REVERSED, reversalAmount dinaikkan ke accrued supaya saldo
 * 0 / status turunan REVERSED. Idempoten: jurnal lawan existing (atau saldo
 * sudah 0) = no-op. Baris yang SUDAH dibayar (paidAmount>0) TIDAK dibatalkan
 * diam-diam — kas sudah keluar via slip; throw berkonteks, saldo historis
 * tetap, resolusi manual (tarik via payroll berikutnya, vonis §6).
 */
export async function cancelAccrualTx(
  tx: TxClient,
  salesInvoiceId: number,
  userId?: number | null,
): Promise<CommissionCancelOutcome> {
  await lockPayableRow(tx, salesInvoiceId)
  await lockInvoiceRow(tx, salesInvoiceId)

  const row = await tx.commissionPayable.findFirst({ where: { salesInvoiceId } })
  if (!row) return { cancelled: false, amount: 0, reason: "tanpa-baris" }

  const accrued = Number(row.accruedAmount)
  const reversal = Number(row.reversalAmount)
  const paid = Number(row.paidAmount)
  if (paid > 0) {
    throw new Error(
      `Un-accrue komisi ditolak: faktur #${salesInvoiceId} sudah dibayar ${paid} via slip (payable #${row.id}); ` +
        "saldo historis dipertahankan — selesaikan manual lewat potongan payroll berikutnya, bukan pembatalan diam.",
    )
  }
  const outstanding = safeRound(safeSubtract(accrued, reversal, 2), 2)
  if (!(outstanding > 0)) return { cancelled: false, amount: 0, reason: "sudah-nol" }

  // Idempotensi SEBELUM tulis: lawan batal existing = sudah dibatalkan.
  const existing = await tx.journal.findFirst({
    where: { referenceType: COMMISSION_CANCELLATION_JOURNAL_REF, referenceId: salesInvoiceId },
    select: { id: true },
  })
  if (existing) return { cancelled: true, amount: outstanding, reason: null }

  // Preflight: mapping + periode jurnal asal terbuka sebelum tulis.
  const { expenseId, payableId } = await resolveCommissionAccounts(tx)
  const origin = row.accrualJournalId
    ? await tx.journal.findUnique({ where: { id: row.accrualJournalId } })
    : null
  // Vonis §6: reversal penuh mekanisme jurnal repo, assertPeriodOpen tanggal
  // asal. Tanpa jurnal asal tertaut, tanggal lawan = kini (tetap dicek).
  const cancelDate = origin?.transactionDate ?? new Date()
  await assertPeriodOpen(cancelDate, tx)

  const journal = await tx.journal.create({
    data: {
      journalNumber: await journalNumber(tx, "KMC", salesInvoiceId),
      transactionDate: cancelDate,
      referenceType: COMMISSION_CANCELLATION_JOURNAL_REF,
      referenceId: salesInvoiceId,
      description: `Pembatalan akrual komisi faktur #${salesInvoiceId} (faktur turun dari paid)`,
      type: "GENERAL",
      status: "POSTED",
      totalDebit: outstanding,
      totalCredit: outstanding,
      createdBy: userId ?? null,
    },
  })
  await tx.journalEntry.createMany({
    data: [
      { journalId: journal.id, accountId: payableId, debit: outstanding, credit: 0, memo: "Batal utang komisi (un-accrue)" },
      { journalId: journal.id, accountId: expenseId, debit: 0, credit: outstanding, memo: "Batal beban komisi (un-accrue)" },
    ],
  })
  if (origin && origin.status === "POSTED") {
    await tx.journal.update({ where: { id: origin.id }, data: { status: "REVERSED" } })
  }
  await tx.commissionPayable.update({
    where: { id: row.id },
    data: { reversalAmount: new Prisma.Decimal(accrued.toFixed(2)) },
  })
  return { cancelled: true, amount: outstanding, reason: null }
}

/**
 * Lawan retur completed di masa retur. Jurnal asal + baris akrual asal
 * TIDAK diubah. Penjaga: R sesudah tulis ≤ A (vonis §6).
 */
export async function reverseTx(
  tx: TxClient,
  salesInvoiceId: number,
  returnId: number,
  returnDpp: number,
  userId?: number | null,
): Promise<{ reversed: number; reason: string | null }> {
  assertJournalClaimRef(COMMISSION_REVERSAL_JOURNAL_REF, returnId)
  await lockPayableRow(tx, salesInvoiceId)

  const row = await tx.commissionPayable.findFirst({ where: { salesInvoiceId } })
  // Tak tertaut = tak mengurangi siapa pun (vonis §6): tanpa baris = no-op.
  if (!row) return { reversed: 0, reason: "tanpa-barissubledger" }

  const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: salesInvoiceId } })
  const percent = invoice.commissionRatePercent == null ? null : Number(invoice.commissionRatePercent)
  if (percent == null || !(percent > 0)) return { reversed: 0, reason: "snapshot-null" }

  const lawan = safeRound(safeMultiply(returnDpp, percent, 4) / 100, 2)
  if (!(lawan > 0)) return { reversed: 0, reason: "hasil-nol" }

  // Idempotensi SEBELUM penjaga kumulatif: replay retur yang sama (jurnal
  // lawan sudah ada) wajib no-op, bukan tertolak "melebihi akrual" hanya
  // karena lawan pertama sudah tercatat di reversalAmount.
  const existing = await tx.journal.findFirst({
    where: { referenceType: COMMISSION_REVERSAL_JOURNAL_REF, referenceId: returnId },
  })
  if (existing) return { reversed: 0, reason: null }

  const accrued = Number(row.accruedAmount)
  const after = safeRound(Number(row.reversalAmount) + lawan, 2)
  if (after - accrued > 0.005) {
    throw new Error(
      `Lawan komisi ditolak: kumulatif lawan ${after} melebihi akrual ${accrued} (faktur #${salesInvoiceId}).`,
    )
  }

  const salesReturn = await tx.salesReturn.findUniqueOrThrow({ where: { id: returnId } })
  const { expenseId, payableId } = await resolveCommissionAccounts(tx)
  await assertPeriodOpen(salesReturn.date, tx)

  const journal = await tx.journal.create({
    data: {
      journalNumber: await journalNumber(tx, "KMR", returnId),
      transactionDate: salesReturn.date,
      referenceType: COMMISSION_REVERSAL_JOURNAL_REF,
      referenceId: returnId,
      description: `Lawan komisi retur #${returnId} atas faktur ${invoice.documentNo ?? salesInvoiceId}`,
      type: "GENERAL",
      status: "POSTED",
      totalDebit: lawan,
      totalCredit: lawan,
      createdBy: userId ?? null,
    },
  })
  await tx.journalEntry.createMany({
    data: [
      { journalId: journal.id, accountId: payableId, debit: lawan, credit: 0, memo: "Lawan utang komisi retur" },
      { journalId: journal.id, accountId: expenseId, debit: 0, credit: lawan, memo: "Koreksi beban komisi retur" },
    ],
  })
  await tx.commissionPayable.update({
    where: { id: row.id },
    data: { reversalAmount: new Prisma.Decimal(after.toFixed(2)) },
  })
  return { reversed: lawan, reason: null }
}

/**
 * Tautan bayar via slip payroll. P sesudah tulis ≤ A − R, kecuali
 * pengecualian retur-sesudah-bayar (saldo boleh negatif tercatat, vonis §6).
 */
export async function paidTx(
  tx: TxClient,
  salesInvoiceId: number,
  amount: number,
  userId?: number | null,
): Promise<{ paid: number }> {
  const row = await tx.commissionPayable.findFirst({ where: { salesInvoiceId } })
  if (!row) throw new Error(`Tautan bayar komisi ditolak: tanpa baris subledger (faktur #${salesInvoiceId}).`)
  return paidByIdTx(tx, row.id, amount, salesInvoiceId, userId)
}

/** Varian by-id: baris slip menaut payableId spesifik (unik 1-1). */
export async function paidByIdTx(
  tx: TxClient,
  payableId: number,
  amount: number,
  salesInvoiceId: number,
  userId?: number | null,
): Promise<{ paid: number }> {
  const row = await tx.commissionPayable.findUniqueOrThrow({ where: { id: payableId } })
  // Baris slip menaut payableId spesifik; invoice argumen harus MILIK baris
  // itu. Mismatch = tautan silang antar-faktur (lock + penjaga saldo akan
  // bekerja atas faktur yang salah) — tolak berisik.
  if (row.salesInvoiceId !== salesInvoiceId) {
    throw new Error(
      `Tautan bayar komisi ditolak: payable #${payableId} milik faktur #${row.salesInvoiceId}, bukan faktur #${salesInvoiceId}.`,
    )
  }
  // Lock baris yang BENAR (faktur pemilik payable ini), bukan argumen caller.
  await lockPayableRow(tx, row.salesInvoiceId)
  if (!(amount > 0)) throw new Error("Tautan bayar komisi ditolak: nominal harus lebih dari nol.")

  const accrued = Number(row.accruedAmount)
  const reversal = Number(row.reversalAmount)
  const paid = Number(row.paidAmount)
  const after = safeRound(paid + amount, 2)
  // Slip tidak boleh menciptakan overpaid sendiri: bayar sesudah tulis wajib
  // ≤ A − R. Saldo negatif hanya boleh LAHIR dari urutan retur-sesudah-bayar
  // (lawan tercatat, bukan izin bayar tambahan) — bayar berikutnya selalu
  // melebihi sisa dan ditolak.
  const ceiling = safeRound(safeSubtract(accrued, reversal, 2), 2)
  if (after - ceiling > 0.005) {
    throw new Error(
      `Tautan bayar komisi ditolak: kumulatif bayar ${after} melebihi sisa ${ceiling} (faktur #${salesInvoiceId}).`,
    )
  }
  await tx.commissionPayable.update({
    where: { id: row.id },
    data: { paidAmount: new Prisma.Decimal(after.toFixed(2)) },
  })
  void userId
  return { paid: after }
}
