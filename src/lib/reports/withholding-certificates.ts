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
import { formatAccounting } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface WithholdingCertificateInput {
  side: "purchase" | "sales"
  date: Date
  /** Nomor bukti potong; penjualan dari withholdingCertificateNo, pembelian nomor tagihan. */
  certificateNo: string | null
  documentNo: string
  /** Nomor faktur penjualan tertaut (sisi penjualan); null bila tidak ada. */
  invoiceNo?: string | null
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

export const WITHHOLDING_TABLE_COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 28 },
  { header: "No. Bukti Potong", align: "left", width: 38 },
  { header: "No. Dokumen", align: "left", width: 38 },
  { header: "Lawan Transaksi", align: "left", width: 56 },
  { header: "Jenis PPh", align: "left", width: 28 },
  { header: "DPP", align: "right", width: 38 },
  { header: "PPh Dipotong", align: "right", width: 38 },
]

export interface WithholdingCertificateTable {
  columns: TableColumn[]
  rows: TableRow[]
  /** Total per sisi — angka yang sama dengan total CSV dari input sama. */
  purchaseWithheld: number
  salesWithheld: number
}

const tableMoney = (value: number) => formatAccounting(value, { zeroDash: false })
const tableDate = (date: Date) =>
  date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })

/**
 * Tabel Bukti Potong dua sisi untuk layar & PDF (B8) — dibangun dari
 * `WithholdingCertificateInput` yang SAMA dengan sumber CSV, jadi total
 * ketiga permukaan tidak bisa berbeda semesta. Kedua sisi ditampilkan
 * terpisah dengan totalnya masing-masing (arah pajaknya berlawanan).
 */
export function buildWithholdingCertificateTable(
  input: readonly WithholdingCertificateInput[],
): WithholdingCertificateTable {
  const rows: TableRow[] = []
  let purchaseWithheld = 0
  let salesWithheld = 0

  const sections: { side: "purchase" | "sales"; label: string; totalLabel: string }[] = [
    { side: "purchase", label: "Pembelian — PPh yang Dipotong Perusahaan", totalLabel: "Total PPh Pembelian" },
    { side: "sales", label: "Penjualan — PPh yang Dipotong Pelanggan", totalLabel: "Total PPh Penjualan" },
  ]
  for (const section of sections) {
    const sideRows = sortRows(input.filter((r) => r.side === section.side))
    rows.push({ kind: "group", label: section.label })
    if (sideRows.length === 0) {
      rows.push({ kind: "notice", text: "Tidak ada bukti potong pada sisi ini untuk periode ini." })
      continue
    }
    let sideTotal = 0
    for (const r of sideRows) {
      sideTotal = safeAdd(sideTotal, r.withheld, 2)
      rows.push({
        kind: "data",
        cells: [
          tableDate(r.date),
          r.certificateNo?.trim() ? r.certificateNo.trim() : "—",
          r.documentNo,
          r.counterparty,
          r.typeCode ? `${r.typeCode} — ${r.typeName ?? ""}`.trim() : "—",
          r.dpp === null ? "" : tableMoney(r.dpp),
          tableMoney(r.withheld),
        ],
      })
    }
    rows.push({
      kind: "total",
      label: section.totalLabel,
      cells: ["", "", "", "", "", "", tableMoney(sideTotal)],
    })
    if (section.side === "purchase") purchaseWithheld = sideTotal
    else salesWithheld = sideTotal
  }

  return { columns: WITHHOLDING_TABLE_COLUMNS, rows, purchaseWithheld, salesWithheld }
}
