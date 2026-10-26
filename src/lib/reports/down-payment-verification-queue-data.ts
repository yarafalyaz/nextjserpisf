/**
 * Loader read-only antrean verifikasi DP menunggu konfirmasi
 * (F-2026-10-26-051-S).
 *
 * Izin: `view_down_payments` ditegakkan fail-closed SEBELUM query apa
 * pun (spec §2: key yang sama dengan daftar uang-muka, tanpa key baru
 * tahap 1). Baca-saja: tanpa jurnal, tanpa tulis, tanpa memanggil hook
 * konfirmasi (BR-DPQ-09). Bukti hanya boolean `adaBukti` di payload
 * keluar — path proofImage dibaca hanya untuk turunan boolean itu,
 * tidak pernah diteruskan ke baris/rekap/log (BR-DPQ-07).
 *
 * Query massal tanpa N+1: semua DP populasi antrean (draft) + DP
 * confirmed se-quotation-nya untuk kumulatif ambang + baris non-draft
 * lain terhitung ember tak_terklasifikasi (BR-DPQ-10) + konteks
 * quotation (grandTotal + snapshot invoiceThresholdPercent). Turunan
 * umur/jarak/tingkat di builder murni
 * `down-payment-verification-queue.ts`.
 */

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import {
  buildDownPaymentVerificationQueue,
  type DownPaymentQueue,
  type DownPaymentQueueDpInput,
  type DownPaymentQueueQuotationInput,
} from "@/lib/reports/down-payment-verification-queue"

export async function getDownPaymentVerificationQueue(
  options: { now?: Date } = {},
): Promise<DownPaymentQueue> {
  await requirePermission("view_down_payments")

  const downPayments = await prisma.downPayment.findMany({
    select: {
      id: true,
      documentNo: true,
      quotationId: true,
      customerId: true,
      amount: true,
      paymentDate: true,
      paymentMethod: true,
      proofImage: true,
      status: true,
      createdAt: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })

  const quotationIds = [...new Set(downPayments.map((dp) => dp.quotationId))]
  const quotations =
    quotationIds.length === 0
      ? []
      : await prisma.quotation.findMany({
          where: { id: { in: quotationIds } },
          select: {
            id: true,
            documentNo: true,
            status: true,
            grandTotal: true,
            invoiceThresholdPercent: true,
          },
        })

  const dpInputs: DownPaymentQueueDpInput[] = downPayments.map((dp) => ({
    downPaymentId: dp.id,
    documentNo: dp.documentNo,
    quotationId: dp.quotationId,
    customerId: dp.customerId,
    customerName: dp.customer.name,
    amount: Number(dp.amount),
    paymentDate: dp.paymentDate,
    paymentMethod: dp.paymentMethod,
    adaBukti: dp.proofImage != null && dp.proofImage !== "",
    status: dp.status,
    createdAt: dp.createdAt,
  }))

  const quotationInputs: DownPaymentQueueQuotationInput[] = quotations.map(
    (quotation) => ({
      quotationId: quotation.id,
      quotationDocumentNo: quotation.documentNo,
      quotationStatus: quotation.status,
      grandTotal: Number(quotation.grandTotal),
      invoiceThresholdPercent:
        quotation.invoiceThresholdPercent == null
          ? null
          : Number(quotation.invoiceThresholdPercent),
    }),
  )

  return buildDownPaymentVerificationQueue(dpInputs, quotationInputs, {
    now: options.now ?? new Date(),
  })
}
