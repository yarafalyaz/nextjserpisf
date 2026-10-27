/**
 * Loader status pajak uang muka (F-2026-10-25-004-V read-model).
 * Satu baris per DP: snapshot PPN beku + status pajak turunan +
 * FP UM tertaut. Status BUKAN kolom baru — diturunkan dari status DP,
 * snapshot, dan djpStatus FP UM (builder murni down-payment-vat).
 * Konsumen layar = BOT Frontend (kartu UI menyusul via handoff).
 */
import { prisma } from "@/lib/db/prisma"
import {
  deriveDownPaymentTaxStatus,
  snapshotFromDownPaymentRow,
  DOWN_PAYMENT_TAX_STATUS_LABELS,
  type DownPaymentTaxStatus,
} from "@/lib/tax/down-payment-vat"

/** Label snapshot PKP DP: legacy = baris pra-fitur tanpa snapshot. */
export const DOWN_PAYMENT_PKP_SNAPSHOT_LEGACY_LABEL = "legacy (snapshot PKP belum tercatat)"

export interface DownPaymentTaxStatusRow {
  downPaymentId: number
  documentNo: string | null
  customerName: string | null
  paymentDate: Date
  amount: number
  dpStatus: string
  /** null = DP legacy pra-fitur / non-kena tanpa snapshot. */
  vatDpp: number | null
  vatAmount: number | null
  vatTaxPeriod: string | null
  /** F-015-V Putusan 3: status PKP perusahaan beku saat confirm; null = legacy. */
  pkpStatusSnapshot: string | null
  pkpEffectiveFromSnapshot: Date | null
  pkpSnapshotLabel: string
  taxInvoiceId: number | null
  taxInvoiceNumber: string | null
  taxStatus: DownPaymentTaxStatus
  taxStatusLabel: string
}

export async function loadDownPaymentTaxStatusRows(input?: {
  /** Batasi ke DP confirmed saja (antrean FP UM). */
  confirmedOnly?: boolean
}): Promise<DownPaymentTaxStatusRow[]> {
  const rows = await prisma.downPayment.findMany({
    where: input?.confirmedOnly ? { status: "confirmed" } : undefined,
    orderBy: { paymentDate: "desc" },
    include: {
      customer: { select: { name: true } },
      taxInvoices: {
        where: { direction: "out" },
        orderBy: { id: "desc" },
        select: { id: true, taxInvoiceNumber: true, djpStatus: true },
      },
    },
  })
  return rows.map((dp) => {
    const snapshot = snapshotFromDownPaymentRow(dp as never)
    const latestFp = dp.taxInvoices[0] ?? null
    const taxStatus = deriveDownPaymentTaxStatus({
      dpStatus: dp.status,
      snapshot,
      linkedTaxInvoiceStatus: latestFp?.djpStatus ?? null,
    })
    return {
      downPaymentId: dp.id,
      documentNo: dp.documentNo,
      customerName: dp.customer?.name ?? null,
      paymentDate: dp.paymentDate,
      amount: Number(dp.amount),
      dpStatus: dp.status,
      vatDpp: snapshot ? snapshot.dppUangMuka : null,
      vatAmount: snapshot ? snapshot.ppnUangMuka : null,
      vatTaxPeriod: snapshot ? snapshot.taxPeriod : null,
      pkpStatusSnapshot: dp.companyPkpStatusSnapshot ?? null,
      pkpEffectiveFromSnapshot: dp.companyPkpEffectiveFromSnapshot ?? null,
      pkpSnapshotLabel: dp.companyPkpStatusSnapshot
        ? dp.companyPkpStatusSnapshot
        : DOWN_PAYMENT_PKP_SNAPSHOT_LEGACY_LABEL,
      taxInvoiceId: latestFp?.id ?? null,
      taxInvoiceNumber: latestFp?.taxInvoiceNumber ?? null,
      taxStatus,
      taxStatusLabel: DOWN_PAYMENT_TAX_STATUS_LABELS[taxStatus],
    }
  })
}
