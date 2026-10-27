/**
 * Loader read-only antrean saldo kredit pelanggan terbuka
 * (F-2026-10-27-083-S + syarat penanda F-2026-10-27-085-V Putusan 2,
 * perluasan F-2026-10-27-086-V Putusan 6).
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
 * syarat J-RF1 customer-credit.service.ts); (4) untuk populasi
 * Quotation/RevisionDown (086-V Putusan 6): SATU query DP confirmed
 * per himpunan quotationId, SATU TaxInvoice atas DP taxed itu,
 * SATU SalesPayment `down_payment` bermarker nomor DP, dan SATU
 * CustomerCredit DownPayment per DP taxed — residu F4 dihitung
 * builder, persis gerbang refundCredit PR #1148. Nol query per
 * baris; snapshot diuji penuh via `snapshotFromDownPaymentRow`
 * (086-V Putusan 7a: legacy tanpa snapshot tidak menahan).
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
  type CustomerCreditQueueQuotationInput,
} from "@/lib/reports/customer-credit-queue"
import { snapshotFromDownPaymentRow } from "@/lib/tax/down-payment-vat"

/** Pola marker alokasi DP di notes SalesPayment (accounting.hook.ts). */
const DP_ALLOCATION_MARKER = /Uang muka dari DP\s+(\S+)/

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

  // 086-V Putusan 6: fakta quotation populasi untuk residu F4.
  const quotationInputs = await loadQuotationInputs(credits)

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
    quotationInputs,
  )
}

/**
 * Satu putaran query massal per quotation populasi Quotation/
 * RevisionDown — DP confirmed quotation itu → saringan snapshot
 * penuh + FP aktif → fakta residu F4 untuk builder.
 */
async function loadQuotationInputs(
  credits: readonly { sourceType: string; sourceId: number }[],
): Promise<CustomerCreditQueueQuotationInput[]> {
  const quotationIds = [
    ...new Set(
      credits
        .filter(
          (credit) =>
            credit.sourceType === "Quotation" ||
            credit.sourceType === "RevisionDown",
        )
        .map((credit) => credit.sourceId),
    ),
  ]
  if (quotationIds.length === 0) return []

  const confirmedDps = await prisma.downPayment.findMany({
    where: { quotationId: { in: quotationIds }, status: "confirmed" },
    select: {
      id: true,
      quotationId: true,
      documentNo: true,
      amount: true,
      vatTransactionCode: true,
      vatRate: true,
      vatDpp: true,
      vatAmount: true,
      vatTaxPeriod: true,
    },
  })

  const taxedDps = confirmedDps.filter((d) => {
    const snap = snapshotFromDownPaymentRow(d as never)
    return snap != null && snap.ppnUangMuka > 0
  })
  if (taxedDps.length === 0) return []

  const taxedIds = taxedDps.map((d) => d.id)
  const [fpRows, dpPayments, dpCreditRows] = await Promise.all([
    prisma.taxInvoice.findMany({
      where: {
        downPaymentId: { in: taxedIds },
        direction: "out",
        djpStatus: { notIn: ["cancelled", "replaced"] },
      },
      select: { downPaymentId: true },
    }),
    prisma.salesPayment.findMany({
      where: {
        paymentMethod: "down_payment",
        notes: { contains: "Uang muka dari DP" },
      },
      select: { amount: true, notes: true },
    }),
    prisma.customerCredit.findMany({
      where: { sourceType: "DownPayment", sourceId: { in: taxedIds } },
      select: { sourceId: true, receivedAmount: true },
    }),
  ])

  const fpActiveIds = new Set<number>()
  for (const fp of fpRows) {
    if (fp.downPaymentId != null) fpActiveIds.add(fp.downPaymentId)
  }

  const allocationsByQuotation = new Map<
    number,
    { documentNo: string; amount: number }[]
  >()
  const quotationByDocNo = new Map<string, number>()
  for (const d of taxedDps) quotationByDocNo.set(d.documentNo, d.quotationId)
  for (const p of dpPayments) {
    const m = DP_ALLOCATION_MARKER.exec(p.notes ?? "")
    if (!m) continue
    const quotationId = quotationByDocNo.get(m[1])
    if (quotationId == null) continue
    const list = allocationsByQuotation.get(quotationId) ?? []
    list.push({ documentNo: m[1], amount: Number(p.amount) })
    allocationsByQuotation.set(quotationId, list)
  }

  const creditsByQuotation = new Map<
    number,
    { downPaymentId: number; receivedAmount: number }[]
  >()
  const quotationByDpId = new Map(taxedDps.map((d) => [d.id, d.quotationId]))
  for (const c of dpCreditRows) {
    const quotationId = quotationByDpId.get(c.sourceId)
    if (quotationId == null) continue
    const list = creditsByQuotation.get(quotationId) ?? []
    list.push({
      downPaymentId: c.sourceId,
      receivedAmount: Number(c.receivedAmount),
    })
    creditsByQuotation.set(quotationId, list)
  }

  const byQuotation = new Map<number, CustomerCreditQueueQuotationInput>()
  for (const d of taxedDps) {
    if (!fpActiveIds.has(d.id)) continue
    const entry = byQuotation.get(d.quotationId) ?? {
      quotationId: d.quotationId,
      taxedDownPayments: [],
      dpAllocations: allocationsByQuotation.get(d.quotationId) ?? [],
      dpCredits: creditsByQuotation.get(d.quotationId) ?? [],
    }
    entry.taxedDownPayments.push({
      downPaymentId: d.id,
      documentNo: d.documentNo,
      amount: Number(d.amount),
    })
    byQuotation.set(d.quotationId, entry)
  }
  return [...byQuotation.values()]
}
