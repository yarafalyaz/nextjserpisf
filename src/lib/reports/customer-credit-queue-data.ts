/**
 * Loader read-only antrean saldo kredit pelanggan terbuka
 * (F-2026-10-27-083-S + syarat vonis Accountant F-2026-10-27-085-V
 * Putusan 2, PR #1114 MERGED 89ec665ea).
 *
 * Gerbang baca: pasangan usul spec §2/Q-CCQ-3 — `view_sales_invoices`
 * DAN `confirm_down_payments` — keduanya ditegakkan fail-closed
 * SEBELUM query apa pun (usul spec; key view khusus baru hanya bila
 * Lead memutus, tidak lahir di sini). Baca-saja mutlak: tidak memanggil
 * allocate/refund/create kredit, tidak menulis tabel apa pun
 * (BR-CCQ-02).
 *
 * Query massal anti-N+1 (BR-CCQ-08): (1) semua CustomerCredit populasi
 * loader (semua status agar ember anomali EC-CCQ-2 terhitung jujur —
 * saringan populasi tampil di builder murni), (2) satu query
 * DownPayment atas himpunan sourceId baris sumber DownPayment (snapshot
 * ppnUangMuka lewat helper existing snapshotFromDownPaymentRow), (3)
 * satu query TaxInvoice keluaran AKTIF (djpStatus bukan
 * cancelled/replaced — syarat J-RF1 persis) atas himpunan downPaymentId
 * yang sama. Nol query per baris (V6: mematikan cabang query TaxInvoice
 * ini wajib membuat tes V1 merah).
 *
 * Payload tanpa data pembayaran sensitif (BR-CCQ-05): select tidak
 * memuat proofImage, referenceNo, rekening/kontak pelanggan.
 */

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { snapshotFromDownPaymentRow } from "@/lib/tax/down-payment-vat"
import {
  buildCustomerCreditQueue,
  type CustomerCreditQueue,
  type CustomerCreditQueueFpUmInput,
  type CustomerCreditQueueItemInput,
} from "@/lib/reports/customer-credit-queue"

export interface CustomerCreditQueueLoaderOptions {
  now?: Date
}

export async function getCustomerCreditQueue(
  options: CustomerCreditQueueLoaderOptions = {},
): Promise<CustomerCreditQueue> {
  await requirePermission("view_sales_invoices")
  await requirePermission("confirm_down_payments")

  const credits = await prisma.customerCredit.findMany({
    select: {
      id: true,
      documentNo: true,
      customerId: true,
      sourceType: true,
      sourceId: true,
      receivedAmount: true,
      allocatedAmount: true,
      refundedAmount: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const downPaymentIds = [
    ...new Set(
      credits
        .filter((credit) => credit.sourceType === "DownPayment")
        .map((credit) => credit.sourceId),
    ),
  ]

  const [downPayments, activeFpRows] =
    downPaymentIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.downPayment.findMany({
            where: { id: { in: downPaymentIds } },
            select: {
              id: true,
              amount: true,
              vatTransactionCode: true,
              vatRate: true,
              vatDpp: true,
              vatAmount: true,
              vatTaxPeriod: true,
            },
          }),
          // 085-V Putusan 2 / J-RF1: FP UM aktif = keluaran dengan
          // djpStatus bukan cancelled/replaced. Satu query massal.
          prisma.taxInvoice.findMany({
            where: {
              downPaymentId: { in: downPaymentIds },
              direction: "out",
              djpStatus: { notIn: ["cancelled", "replaced"] },
            },
            select: { downPaymentId: true },
          }),
        ])

  const activeDownPaymentIds = new Set(
    activeFpRows
      .map((row) => row.downPaymentId)
      .filter((id): id is number => id != null),
  )

  const fpUmFacts: CustomerCreditQueueFpUmInput[] = downPayments.map((dp) => {
    const snapshot = snapshotFromDownPaymentRow(dp as never)
    return {
      downPaymentId: dp.id,
      ppnUangMuka: snapshot ? snapshot.ppnUangMuka : null,
      hasActiveOutTaxInvoice: activeDownPaymentIds.has(dp.id),
    }
  })

  const creditInputs: CustomerCreditQueueItemInput[] = credits.map(
    (credit) => ({
      creditId: credit.id,
      documentNo: credit.documentNo,
      customerId: credit.customerId,
      customerName: credit.customer.name,
      sourceType: credit.sourceType,
      sourceId: credit.sourceId,
      receivedAmount: Number(credit.receivedAmount),
      allocatedAmount: Number(credit.allocatedAmount),
      refundedAmount: Number(credit.refundedAmount),
      status: credit.status,
      createdAt: credit.createdAt,
      updatedAt: credit.updatedAt,
    }),
  )

  return buildCustomerCreditQueue(creditInputs, fpUmFacts, {
    now: options.now ?? new Date(),
  })
}
