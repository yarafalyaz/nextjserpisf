/**
 * Loader ekspor CSV Bukti Potong PPh (F-2026-10-20-35(a), F-003).
 *
 * Sumber utama sesudah model ada: dokumen `WithholdingCertificate`
 * (snapshot pasal+kode+tarif+DPP — edit master tak mengubah baris ini).
 * Baris dokumen komersial TANPA bupot tetap tampil fallback master
 * berjalan berlabel lewat nomor kosong; bupot yg menaut dokumen sumber
 * menggantikan baris fallback dokumen itu (tanpa dobel).
 */

import { prisma } from "@/lib/db/prisma"
import { activeSalesPaymentWhere } from "@/lib/finance/payment-status"
import {
  purchaseDpp,
  serializeWithholdingCertificatesCsv,
  type WithholdingCertificateCsv,
  type WithholdingCertificateInput,
} from "@/lib/reports/withholding-certificates"

type Period = { start: Date; end: Date }

/**
 * SATU sumber Bukti Potong untuk layar, PDF, dan CSV (B8): baris dua sisi
 * (dokumen `WithholdingCertificate` snapshot + fallback dokumen komersial
 * tanpa bupot) yang kemudian dibentuk menjadi tabel layar/PDF oleh
 * `buildWithholdingCertificateTable` dan menjadi CSV oleh
 * `serializeWithholdingCertificatesCsv`. Tidak ada permukaan yang boleh
 * membaca semesta dokumennya sendiri lagi.
 */
export async function loadWithholdingCertificateInputs(
  period: Period,
): Promise<WithholdingCertificateInput[]> {
  const [bills, payments, certificates] = await Promise.all([
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
      where: activeSalesPaymentWhere({
        paymentDate: { gte: period.start, lte: period.end },
        withholdingAmount: { gt: 0 },
      }),
      include: {
        salesInvoice: { select: { documentNo: true, customer: { select: { name: true, taxId: true } } } },
        withholdingType: { select: { code: true, name: true, rate: true } },
      },
      orderBy: [{ paymentDate: "asc" }, { documentNo: "asc" }],
    }),
    prisma.withholdingCertificate.findMany({
      where: {
        withholdingDate: { gte: period.start, lte: period.end },
        status: { not: "revoked" },
      },
      include: {
        withholdingType: { select: { code: true, name: true } },
        vendorBill: { select: { documentNo: true } },
        salesPayment: { select: { documentNo: true } },
      },
      orderBy: [{ withholdingDate: "asc" }, { certificateNumber: "asc" }],
    }),
  ])

  // Bupot snapshot menggantikan baris fallback dokumen sumber tertaut.
  const certifiedBillIds = new Set(
    certificates.map((c) => c.vendorBillId).filter((v): v is number => v != null),
  )
  const certifiedPaymentIds = new Set(
    certificates.map((c) => c.salesPaymentId).filter((v): v is number => v != null),
  )

  const inputs: WithholdingCertificateInput[] = [
    ...certificates.map((cert): WithholdingCertificateInput => ({
      side: cert.direction === "we_withhold" ? "purchase" : "sales",
      date: cert.withholdingDate,
      certificateNo: cert.certificateNumber,
      documentNo: cert.vendorBill?.documentNo ?? cert.salesPayment?.documentNo ?? cert.certificateNumber,
      counterparty: cert.counterpartyName,
      npwp: cert.counterpartyTaxId,
      typeCode: cert.withholdingType.code,
      typeName: `${cert.withholdingType.name} (${cert.article}${cert.objectCode ? ` ${cert.objectCode}` : ""})`,
      rate: Number(cert.tariff),
      dpp: Number(cert.dpp),
      withheld: Number(cert.withheldAmount),
    })),
    ...bills
      .filter((bill) => !certifiedBillIds.has(bill.id))
      .map((bill): WithholdingCertificateInput => ({
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
    ...payments
      .filter((payment) => !certifiedPaymentIds.has(payment.id))
      .map((payment): WithholdingCertificateInput => ({
      side: "sales",
      date: payment.paymentDate,
      certificateNo: payment.withholdingCertificateNo,
      documentNo: payment.documentNo,
      invoiceNo: payment.salesInvoice?.documentNo ?? null,
      counterparty: payment.salesInvoice?.customer?.name ?? "",
      npwp: payment.salesInvoice?.customer?.taxId ?? null,
      typeCode: payment.withholdingType?.code ?? null,
      typeName: payment.withholdingType?.name ?? null,
      rate: payment.withholdingType ? Number(payment.withholdingType.rate) : null,
      dpp: null,
      withheld: Number(payment.withholdingAmount),
    })),
  ]

  return inputs
}

export async function loadWithholdingCertificatesCsv(period: Period): Promise<WithholdingCertificateCsv> {
  return serializeWithholdingCertificatesCsv(await loadWithholdingCertificateInputs(period))
}
