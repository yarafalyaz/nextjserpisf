/**
 * Loader read-only antrean saldo kredit pelanggan terbuka
 * (F-2026-10-27-083-S + syarat penanda F-2026-10-27-085-V Putusan 2).
 *
 * Gerbang baca Q-CCQ-3 BELUM diputus Lead: loader memakai gerbang
 * paling ketat dari usul spec §2 — `view_sales_invoices` DAN
 * `confirm_down_payments` — fail-closed SEBELUM query apa pun.
 * Melonggarkan gerbang = putusan Lead, bukan perubahan diam-diam.
 *
 * Query massal anti-N+1 (BR-CCQ-08): (1) semua CustomerCredit +
 * nama pelanggan relasi existing; (2) snapshot DownPayment untuk
 * sumber DownPayment populasi; (3) SATU query TaxInvoice atas
 * himpunan downPaymentId populasi untuk FP keluaran aktif
 * (direction "out", djpStatus bukan cancelled/replaced — persis
 * syarat J-RF1 customer-credit.service.ts). Nol query per baris.
 *
 * Baca-saja mutlak (BR-CCQ-02, 085-V Batas build): loader tidak
 * menulis CustomerCredit/SalesPayment/Journal/TaxInvoice dan tidak
 * memanggil allocate/refund. Payload tanpa rekening/bukti/kontak
 * (BR-CCQ-05) — select eksplisit kolom antrean saja. Turunan
 * populasi/saldo/umur/penanda di builder murni
 * `customer-credit-queue.ts`; UI menempel payload apa adanya.
 */

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import {
  buildCustomerCreditQueue,
  type CustomerCreditQueue,
  type CustomerCreditQueueCreditInput,
  type CustomerCreditQueueDownPaymentInput,
} from "@/lib/reports/customer-credit-queue"

export async function getCustomerCreditQueue(
  options: { now?: Date } = {},
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

  const [downPayments, activeFps] =
    downPaymentIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.downPayment.findMany({
            where: { id: { in: downPaymentIds } },
            select: { id: true, vatAmount: true },
          }),
          // 085-V Putusan 2 / V6: cabang query TaxInvoice massal ini
          // adalah penjaga penanda — mematikannya membuat V1 MERAH.
          prisma.taxInvoice.findMany({
            where: {
              downPaymentId: { in: downPaymentIds },
              direction: "out",
              djpStatus: { notIn: ["cancelled", "replaced"] },
            },
            select: { downPaymentId: true },
          }),
        ])

  const activeFpDownPaymentIds = new Set<number>()
  for (const fp of activeFps) {
    if (fp.downPaymentId != null) activeFpDownPaymentIds.add(fp.downPaymentId)
  }

  const creditInputs: CustomerCreditQueueCreditInput[] = credits.map(
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
    }),
  )

  const downPaymentInputs: CustomerCreditQueueDownPaymentInput[] =
    downPayments.map((dp) => ({
      downPaymentId: dp.id,
      ppnUangMuka: dp.vatAmount == null ? null : Number(dp.vatAmount),
    }))

  return buildCustomerCreditQueue(
    creditInputs,
    downPaymentInputs,
    activeFpDownPaymentIds,
    { now: options.now },
  )
}
