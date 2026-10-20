/**
 * Bukti Potong PPh — ekspor CSV dua sisi (F-2026-10-20-35(a)).
 *
 * READY-LANJUT read-only dari loader existing bukti-potong-pph:
 * - Pembelian: VendorBill dipotong (NPWP dari Vendor.npwp), DPP = subtotal − diskon.
 * - Penjualan: SalesPayment dipotong pelanggan (NPWP dari Customer.taxId);
 *   DPP pembayaran tidak tersimpan — kolom DPP dikosongkan, jangan dihitung
 *   dari tarif tebakan.
 *
 * Inti e-Bupot/API DJP ditunda-teknis (kredensial PJAP); CSV ini bahan
 * pelaporan manual. Pure (tanpa Prisma/DOM).
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"

export interface WithholdingCertificateInput {
  side: "purchase" | "sales"
  date: Date
  /** Nomor bukti potong; penjualan dari withholdingCertificateNo, pembelian nomor tagihan. */
  certificateNo: string | null
  documentNo: string
  counterparty: string
  npwp?: string | null
  typeCode: string | null
  typeName: string | null
  rate: number | null
  /** Dasar pengenaan; null bila tidak tersimpan (sisi penjualan). */
  dpp: number | null
  withheld: number
}

export interface WithholdingCertificateCsv {
  csv: string
  purchaseCount: number
  salesCount: number
  purchaseWithheld: number
  salesWithheld: number
}

function csvCell(value: string): string {
  const safeValue = /^[=+\-@\t|%]/.test(value) ? `\t${value}` : value
  return `"${safeValue.replace(/"/g, '""')}"`
}

function isoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function amount(value: number | null): string {
  return value === null ? "" : value.toFixed(2)
}

function sortRows(rows: WithholdingCertificateInput[]): WithholdingCertificateInput[] {
  return [...rows].sort((a, b) => {
    const byDate = a.date.getTime() - b.date.getTime()
    return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
  })
}

export function purchaseDpp(subtotal: number, discountAmount: number | null | undefined): number {
  return safeSubtract(subtotal, discountAmount ?? 0, 2)
}

export function serializeWithholdingCertificatesCsv(
  input: readonly WithholdingCertificateInput[],
): WithholdingCertificateCsv {
  const purchase = sortRows(input.filter((r) => r.side === "purchase"))
  const sales = sortRows(input.filter((r) => r.side === "sales"))

  const header = [
    "Sisi",
    "Tanggal",
    "No. Bukti Potong",
    "No. Dokumen",
    "Lawan Transaksi",
    "NPWP",
    "Jenis PPh",
    "Tarif (%)",
    "DPP",
    "PPh Dipotong",
  ]

  const toRow = (r: WithholdingCertificateInput): string[] => [
    r.side === "purchase" ? "Pembelian" : "Penjualan",
    isoDate(r.date),
    r.certificateNo?.trim() ? r.certificateNo.trim() : r.documentNo,
    r.documentNo,
    r.counterparty,
    r.npwp?.trim() ? r.npwp.trim() : "",
    r.typeCode ? `${r.typeCode} — ${r.typeName ?? ""}`.trim() : "",
    r.rate === null ? "" : String(r.rate),
    amount(r.dpp),
    amount(r.withheld),
  ]

  const purchaseWithheld = purchase.reduce((sum, r) => safeAdd(sum, r.withheld, 2), 0)
  const salesWithheld = sales.reduce((sum, r) => safeAdd(sum, r.withheld, 2), 0)

  const rows: string[][] = [
    ["Bukti Potong PPh"],
    [],
    header,
    ...purchase.map(toRow),
    ...sales.map(toRow),
    [],
    ["Total PPh Pembelian", "", "", "", "", "", "", "", "", amount(purchaseWithheld)],
    ["Total PPh Penjualan", "", "", "", "", "", "", "", "", amount(salesWithheld)],
  ]

  return {
    csv: `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
    purchaseCount: purchase.length,
    salesCount: sales.length,
    purchaseWithheld,
    salesWithheld,
  }
}
