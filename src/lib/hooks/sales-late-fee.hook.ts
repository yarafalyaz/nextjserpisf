/**
 * Hook jurnal denda piutang (F-2026-10-22-093-V P3/P6, vonis BOT 4 PR #563).
 *
 * - Terbit: D Piutang Usaha (salesReceivableAccountId) /
 *   K Pendapatan Denda (lateFeeIncomeAccountId) — akrual saat terbit.
 * - Akun pendapatan denda kosong = fail-closed, TANPA fallback ke
 *   pendapatan penjualan (P2d). Nol jurnal parsial: semua di satu tx.
 * - Pembayaran: D Kas/Bank / K Piutang Usaha, hanya saldo dokumen denda.
 * - Waiver/koreksi: reversal jurnal dokumen (D Pendapatan / K Piutang
 *   lewat reverseJournalsByReferenceTx) — TIDAK ada edit nominal posted.
 * - assertPeriodOpen dalam tx; idempotency dijaga pemanggil via
 *   FinancialIdempotencyKey + UNIQUE journals(referenceType, referenceId).
 */

import { prisma, TxClient } from "@/lib/db/prisma"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import {
  assertAccountsExist,
  assertJournalClaimRef,
  reverseJournalsByReferenceTx,
} from "@/lib/hooks/accounting.hook"

type Db = TxClient | typeof prisma

const executeInTx = async (
  txClient: TxClient | undefined,
  callback: (tx: TxClient) => Promise<void>,
) => {
  return txClient ? callback(txClient) : prisma.$transaction(callback)
}

async function journalNumber(tx: TxClient, prefix: string, refId: number): Promise<string> {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)
  return `${prefix}/${refId}/${ts}`
}

export const LATE_FEE_JOURNAL_REF = "SalesLateFee"
export const LATE_FEE_PAYMENT_JOURNAL_REF = "SalesLateFeePayment"

/** Jurnal akrual terbit dokumen denda. Idempoten per dokumen (UNIQUE ref). */
export async function onSalesLateFeePosted(
  lateFeeId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  assertJournalClaimRef(LATE_FEE_JOURNAL_REF, lateFeeId)
  await executeInTx(txClient, async (tx) => {
    const settings = await tx.systemSetting.findFirst()
    if (!settings) throw new Error("Pengaturan sistem belum dikonfigurasi.")
    if (!settings.salesReceivableAccountId) {
      throw new Error(
        "Dokumen denda ditolak: akun Piutang Usaha belum dikonfigurasi di Pengaturan.",
      )
    }
    if (!settings.lateFeeIncomeAccountId) {
      throw new Error(
        "Dokumen denda ditolak: akun Pendapatan Denda belum dikonfigurasi di Pengaturan (Pengaturan → Akun). Isi akun pendapatan denda dulu — tidak ada fallback ke pendapatan penjualan.",
      )
    }

    const doc = await tx.salesLateFee.findUniqueOrThrow({ where: { id: lateFeeId } })
    if (doc.reversesId != null) return // dokumen reversal: jurnalnya jurnal reversal, bukan akrual baru
    const amount = Number(doc.amount)
    if (!(amount > 0)) throw new Error("Dokumen denda ditolak: nominal denda harus lebih dari nol.")

    const existing = await tx.journal.findFirst({
      where: { referenceType: LATE_FEE_JOURNAL_REF, referenceId: lateFeeId },
    })
    if (existing) return

    await assertPeriodOpen(doc.date, tx)
    await assertAccountsExist(
      tx,
      [settings.salesReceivableAccountId, settings.lateFeeIncomeAccountId],
      "Dokumen denda",
    )

    const journal = await tx.journal.create({
      data: {
        journalNumber: await journalNumber(tx, "LF", lateFeeId),
        transactionDate: doc.date,
        referenceType: LATE_FEE_JOURNAL_REF,
        referenceId: lateFeeId,
        description: `Denda keterlambatan ${doc.documentNo} atas faktur #${doc.salesInvoiceId}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: amount,
        totalCredit: amount,
        createdBy: userId ?? null,
      },
    })
    await tx.journalEntry.createMany({
      data: [
        {
          journalId: journal.id,
          accountId: settings.salesReceivableAccountId,
          debit: amount,
          credit: 0,
          memo: "Piutang denda keterlambatan",
        },
        {
          journalId: journal.id,
          accountId: settings.lateFeeIncomeAccountId,
          debit: 0,
          credit: amount,
          memo: "Pendapatan denda keterlambatan",
        },
      ],
    })
    await tx.salesLateFee.update({ where: { id: lateFeeId }, data: { journalId: journal.id } })
  })
}

/** Jurnal kas pembayaran dokumen denda (D Kas / K Piutang). */
export async function onSalesLateFeePaymentCreated(
  paymentId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  assertJournalClaimRef(LATE_FEE_PAYMENT_JOURNAL_REF, paymentId)
  await executeInTx(txClient, async (tx) => {
    const settings = await tx.systemSetting.findFirst()
    if (!settings) throw new Error("Pengaturan sistem belum dikonfigurasi.")
    if (!settings.salesReceivableAccountId) {
      throw new Error("Pembayaran denda ditolak: akun Piutang Usaha belum dikonfigurasi.")
    }
    const payment = await tx.salesLateFeePayment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { salesLateFee: true },
    })
    const amount = Number(payment.amount)
    if (!(amount > 0)) throw new Error("Pembayaran denda ditolak: nominal harus lebih dari nol.")

    const existing = await tx.journal.findFirst({
      where: { referenceType: LATE_FEE_PAYMENT_JOURNAL_REF, referenceId: paymentId },
    })
    if (existing) return

    const cashAccountId = payment.accountId ?? settings.cashBankAccountId
    if (!cashAccountId) {
      throw new Error("Pembayaran denda ditolak: akun kas/bank belum dikonfigurasi.")
    }
    await assertPeriodOpen(payment.paymentDate, tx)
    await assertAccountsExist(tx, [cashAccountId, settings.salesReceivableAccountId], "Pembayaran denda")

    const journal = await tx.journal.create({
      data: {
        journalNumber: await journalNumber(tx, "LFP", paymentId),
        transactionDate: payment.paymentDate,
        referenceType: LATE_FEE_PAYMENT_JOURNAL_REF,
        referenceId: paymentId,
        description: `Pembayaran denda ${payment.salesLateFee.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: amount,
        totalCredit: amount,
        createdBy: userId ?? null,
      },
    })
    await tx.journalEntry.createMany({
      data: [
        { journalId: journal.id, accountId: cashAccountId, debit: amount, credit: 0, memo: "Penerimaan kas denda" },
        {
          journalId: journal.id,
          accountId: settings.salesReceivableAccountId,
          debit: 0,
          credit: amount,
          memo: "Pelunasan piutang denda",
        },
      ],
    })
  })
}

/** Waiver/koreksi: reversal jurnal dokumen asal (P6). Dokumen asal → reversed. */
export async function reverseSalesLateFeeJournalTx(
  tx: TxClient,
  lateFeeId: number,
  reason: string,
  userId?: number | null,
): Promise<void> {
  assertJournalClaimRef(LATE_FEE_JOURNAL_REF, lateFeeId)
  await reverseJournalsByReferenceTx(tx, LATE_FEE_JOURNAL_REF, lateFeeId, reason, userId)
  // Jurnal pembayaran ikut dibalik supaya piutang denda tidak yatim.
  const payments = await tx.salesLateFeePayment.findMany({
    where: { salesLateFeeId: lateFeeId },
    select: { id: true },
  })
  for (const p of payments) {
    await reverseJournalsByReferenceTx(tx, LATE_FEE_PAYMENT_JOURNAL_REF, p.id, reason, userId)
  }
}

export type { Db as LateFeeDb }
