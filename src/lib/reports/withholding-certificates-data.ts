/**
 * Loader ekspor CSV Bukti Potong PPh (F-2026-10-20-35(a)).
 *
 * Query sama dengan halaman bukti-potong-pph: pembelian dari VendorBill
 * posted/partial/paid ber-withholding, penjualan dari SalesPayment
 * ber-withholding. NPWP lawan dari master existing (Vendor.npwp /
 * Customer.taxId) — tanpa migrasi, tanpa jurnal.
 */

import { prisma } from "@/lib/db/prisma"
import {
  purchaseDpp,
  serializeWithholdingCertificatesCsv,
  type WithholdingCertificateCsv,
  type WithholdingCertificateInput,
} from "@/lib/reports/withholding-certificates"

type Period = { start: Date; end: Date }

export async function loadWithholdingCertificatesCsv(period: Period): Promise<WithholdingCertificateCsv> {
  const [bills, payments] = await Promise.all([
    prisma.vendorBill.findMany({
      where: {
        date: { gte: period.start, lte: period.end },
        status: { in: ["posted", "partial", "paid"] },
        deletedAt: null,
        withholdingAmount: { gt: 0 },
      },
      include: {
        vendor: { select: { name: true, npwp: true } },
        withholdingType: { select: { code: true, name: true, rate: true } },
      },
      orderBy: [{ date: "asc" }, { documentNo: "asc" }],
    }),
    prisma.salesPayment.findMany({
      where: {
        paymentDate: { gte: period.start, lte: period.end },
        withholdingAmount: { gt: 0 },
      },
      include: {
        salesInvoice: { select: { customer: { select: { name: true, taxId: true } } } },
        withholdingType: { select: { code: true, name: true, rate: true } },
      },
      orderBy: [{ paymentDate: "asc" }, { documentNo: "asc" }],
    }),
  ])

  const inputs: WithholdingCertificateInput[] = [
    ...bills.map((bill): WithholdingCertificateInput => ({
      side: "purchase",
      date: bill.date,
      certificateNo: null,
      documentNo: bill.documentNo,
      counterparty: bill.vendor.name,
      npwp: bill.vendor.npwp,
      typeCode: bill.withholdingType?.code ?? null,
      typeName: bill.withholdingType?.name ?? null,
      rate: bill.withholdingType ? Number(bill.withholdingType.rate) : null,
      dpp: purchaseDpp(Number(bill.subtotal), Number(bill.discountAmount ?? 0)),
      withheld: Number(bill.withholdingAmount),
    })),
    ...payments.map((payment): WithholdingCertificateInput => ({
      side: "sales",
      date: payment.paymentDate,
      certificateNo: payment.withholdingCertificateNo,
      documentNo: payment.documentNo,
      counterparty: payment.salesInvoice?.customer?.name ?? "",
      npwp: payment.salesInvoice?.customer?.taxId ?? null,
      typeCode: payment.withholdingType?.code ?? null,
      typeName: payment.withholdingType?.name ?? null,
      rate: payment.withholdingType ? Number(payment.withholdingType.rate) : null,
      dpp: null,
      withheld: Number(payment.withholdingAmount),
    })),
  ]

  return serializeWithholdingCertificatesCsv(inputs)
}
