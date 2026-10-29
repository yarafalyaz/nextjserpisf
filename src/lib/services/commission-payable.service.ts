/**
 * Subledger utang komisi tahap 3 (vonis R-komisi-vonispayable §2–§5).
 *
 * - accrueTx: dipanggil saat transisi faktur → paid. Satu tx = snapshot +
 *   baris subledger + jurnal Dr beban / Cr utang. Syarat lahir: penjual
 *   tidak null, snapshot persen ada, hasil > 0, mapping lengkap. Satu syarat
 *   gagal = nol baris + nol jurnal berlabel alasan (faktur tetap paid).
 * - reverseTx: lawan retur completed. Penjaga kumulatif R ≤ A dalam tx.
 * - paidTx: tautan bayar via slip payroll (P ≤ A − R, kecuali retur-sesudah-bayar).
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
  if (payable.reportGroup !== "OCLY") {
    throw new Error(
      `Akrual komisi ditolak: akun utang komisi harus tipe OCLY (dapat ${payable.reportGroup ?? "?"}).`,
    )
  }
  return { expenseId, payableId }
}

/**
 * Akrual utang komisi saat faktur lunas. Idempoten: baris existing =
 * no-op. Wajib dipanggil DALAM tx transisi paid pemanggil.
 */
export async function accrueTx(
  tx: TxClient,
  salesInvoiceId: number,
  userId?: number | null,
  known?: { status?: unknown; salesEmployeeId?: unknown; commissionRatePercent?: unknown; grandTotal?: unknown; taxAmount?: unknown; updatedAt?: unknown } | null,
): Promise<CommissionAccrueOutcome> {
  assertJournalClaimRef(COMMISSION_ACCRUAL_JOURNAL_REF, salesInvoiceId)

  const existing = await tx.commissionPayable.findFirst({ where: { salesInvoiceId } })
  if (existing) return { accrued: true, amount: Number(existing.accruedAmount), reason: null }

  // Pemanggil (recalcCore) sudah membaca invoice — pakai yang diketahui bila
  // ada supaya tanpa query ganda (mock `mockResolvedValueOnce` + hemat 1 round-trip).
  const invoice =
    known != null
      ? (known as { status: unknown; salesEmployeeId: unknown; commissionRatePercent: unknown; grandTotal: unknown; taxAmount: unknown; updatedAt: unknown })
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

  const { expenseId, payableId } = await resolveCommissionAccounts(tx)
  const txDate = invoice.updatedAt instanceof Date ? invoice.updatedAt : new Date(invoice.updatedAt as string | number | undefined ?? Date.now())
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
      salesEmployeeId: invoice.salesEmployeeId,
      accruedAmount: new Prisma.Decimal(amount.toFixed(2)),
      accrualJournalId: journal.id,
      createdBy: userId ?? null,
    },
  })
  return { accrued: true, amount, reason: null }
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

  const row = await tx.commissionPayable.findFirst({ where: { salesInvoiceId } })
  // Tak tertaut = tak mengurangi siapa pun (vonis §6): tanpa baris = no-op.
  if (!row) return { reversed: 0, reason: "tanpa-barissubledger" }

  const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: salesInvoiceId } })
  const percent = invoice.commissionRatePercent == null ? null : Number(invoice.commissionRatePercent)
  if (percent == null || !(percent > 0)) return { reversed: 0, reason: "snapshot-null" }

  const lawan = safeRound(safeMultiply(returnDpp, percent, 4) / 100, 2)
  if (!(lawan > 0)) return { reversed: 0, reason: "hasil-nol" }

  const accrued = Number(row.accruedAmount)
  const after = safeRound(Number(row.reversalAmount) + lawan, 2)
  if (after - accrued > 0.005) {
    throw new Error(
      `Lawan komisi ditolak: kumulatif lawan ${after} melebihi akrual ${accrued} (faktur #${salesInvoiceId}).`,
    )
  }

  const existing = await tx.journal.findFirst({
    where: { referenceType: COMMISSION_REVERSAL_JOURNAL_REF, referenceId: returnId },
  })
  if (existing) return { reversed: 0, reason: null }

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
  if (!(amount > 0)) throw new Error("Tautan bayar komisi ditolak: nominal harus lebih dari nol.")

  const accrued = Number(row.accruedAmount)
  const reversal = Number(row.reversalAmount)
  const paid = Number(row.paidAmount)
  const after = safeRound(paid + amount, 2)
  // ponytail: slip ciptakan overpaid sendiri dilarang; overpaid hanya lahir
  // dari urutan retur-sesudah-bayar. Ceiling: tolak bila after > A − R DAN
  // saldo kini belum negatif.
  const ceiling = safeRound(safeSubtract(accrued, reversal, 2), 2)
  const balance = safeRound(safeSubtract(ceiling, paid, 2), 2)
  if (after - ceiling > 0.005 && balance >= 0) {
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
