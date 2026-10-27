/**
 * Faktur SPT Masa PPN — daftar faktur penjualan (PPN keluaran) dan faktur
 * pembelian (PPN masukan) yang dipakai untuk mengisi SPT Masa PPN.
 *
 * Definisi PPN dokumen sengaja disamakan dengan **Rekonsiliasi PPN** supaya
 * kedua laporan tidak pernah saling bertentangan: sisi penjualan memakai
 * `SalesInvoice.taxAmount`, sisi pembelian memakai `VendorBill.tax`, dan hanya
 * dokumen berstatus posted/partial/paid (draft belum jadi faktur).
 *
 * DPP (Dasar Pengenaan Pajak) = nilai sebelum pajak = subtotal − diskon. Ini
 * penting: memakai subtotal mentah akan memasukkan diskon ke DPP dan PPN-nya
 * jadi tidak cocok dengan faktur pajak yang diterbitkan.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd, safeMultiply, safeRound, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 266mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 20 },
  { header: "Nomor Dokumen", align: "left", width: 28 },
  { header: "Nomor Faktur Pajak", align: "left", width: 34 },
  { header: "Pelanggan / Pemasok", align: "left", width: 52 },
  { header: "NPWP", align: "left", width: 32 },
  { header: "DPP", align: "right", width: 32 },
  { header: "PPN", align: "right", width: 32 },
  { header: "Total", align: "right", width: 36 },
]

export interface VatInvoiceInput {
  date: Date
  /** Nomor dokumen internal; null = nomor resmi belum terbit (diterbitkan saat posting). */
  documentNo: string | null
  /** Nomor faktur pajak e-Faktur/Coretax; kosong = belum dicatat. */
  taxInvoiceNumber?: string | null
  counterparty: string
  /** NPWP lawan transaksi (Customer.taxId / Vendor.npwp); kosong = belum dicatat. */
  npwp?: string | null
  /** Dasar Pengenaan Pajak = subtotal − diskon. */
  dpp: number
  vat: number
  total: number
  /**
   * Retur terproses atas faktur ini (F-2026-10-20-33(a)): hanya peringatan —
   * DPP/PPN retur TIDAK mengurangi angka laporan di sini; masa & dasar
   * pengurang menunggu vonis accountant (F-33(b)). Tanpa field ini baris
   * tampil biasa.
   */
  returnRef?: { documentNo: string; sourceDocumentNo: string | null } | null
}

export interface VatInvoiceGroup {
  count: number
  dpp: number
  vat: number
  total: number
}

/**
 * Pengurang masa retur (vonis Salsa F-2026-10-20-61): baris retur penjualan
 * terproses pada masa berjalan. DPP-retur = Σ qty × SalesReturnItem.price
 * (price membeku dari faktur asal saat create); PPN-retur = DPP-retur × tarif
 * efektif faktur asal. Baris pengurang tampil TERPISAH — baris faktur asal
 * tidak diubah. Sisi beli belum ada (tautan PurchaseReturn→VendorBill ambigu).
 */
export interface VatReturnDeductionInput {
  date: Date
  /** Nomor nota retur. */ documentNo: string
  /** Nomor faktur asal; null = retur tanpa faktur (tanpa PPN-retur). */ sourceDocumentNo: string | null
  counterparty: string
  /** DPP pengurang. */ dpp: number
  /** PPN pengurang (0 bila faktur asal tanpa PPN / tanpa faktur asal). */ vat: number
}

/**
 * Hitung pengurang satu retur (murni, untuk loader + tes langsung).
 * source null / taxAmount 0 / DPP asal 0 → vat 0 (ditandai lewat vat=0,
 * bukan ditebak tarifnya).
 */
export function computeReturnDeduction(input: {
  qty: number
  price: number
  source: { subtotal: number; discount: number; taxAmount: number } | null
}): { dpp: number; vat: number } {
  const dpp = safeRound(safeMultiply(input.qty, input.price), 2)
  if (!input.source || input.source.taxAmount <= 0) return { dpp, vat: 0 }
  const sourceDpp = safeSubtract(input.source.subtotal, input.source.discount, 2)
  if (sourceDpp <= 0) return { dpp, vat: 0 }
  const rate = input.source.taxAmount / sourceDpp
  return { dpp, vat: safeRound(dpp * rate, 2) }
}

export interface VatInvoiceListResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  output: VatInvoiceGroup
  input: VatInvoiceGroup
  /** Faktur tanpa nomor faktur pajak tercatat (keluaran + masukan). */
  missingTaxInvoiceCount: number
  /** Faktur ber-retur terproses pada periode ini (peringatan saja). */
  returnedInvoiceCount: number
  /** Total pengurang masa retur (sisi jual); dpp/vat mengurangi posisi. */
  returnDeduction: VatInvoiceGroup & { count: number }
  /** Pengurang bersih: PPN keluaran neto = keluaran − pengurang. */
  outputNetVat: number
  /** Selisih PPN keluaran − masukan; positif = kurang bayar. */
  netVat: number
  verdict: string
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

function summarize(items: VatInvoiceInput[]): VatInvoiceGroup {
  return items.reduce<VatInvoiceGroup>(
    (acc, item) => ({
      count: acc.count + 1,
      dpp: safeAdd(acc.dpp, item.dpp, 2),
      vat: safeAdd(acc.vat, item.vat, 2),
      total: safeAdd(acc.total, item.total, 2),
    }),
    { count: 0, dpp: 0, vat: 0, total: 0 },
  )
}

function sortByDate<T extends { date: Date; documentNo: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const byDate = a.date.getTime() - b.date.getTime()
    return byDate !== 0 ? byDate : (a.documentNo ?? "").localeCompare(b.documentNo ?? "", "id-ID")
  })
}

/** Sel faktur pajak: nomor e-Faktur bila ada, fallback nomor dokumen internal. */
export function displayTaxInvoiceNo(item: VatInvoiceInput): string {
  const taxNo = item.taxInvoiceNumber?.trim()
  return taxNo ? taxNo : (item.documentNo ?? "–")
}

function hasTaxInvoiceNo(item: VatInvoiceInput): boolean {
  return Boolean(item.taxInvoiceNumber?.trim())
}

/** NPWP lawan: nilai tercatat apa adanya; kosong/blank = "–". */
export function displayNpwp(item: VatInvoiceInput): string {
  const npwp = item.npwp?.trim()
  return npwp ? npwp : "–"
}

function dataRows(items: VatInvoiceInput[]): TableRow[] {
  const rows: TableRow[] = []
  for (const item of items) {
    rows.push({
      kind: "data",
      cells: [
        shortDate(item.date),
        item.documentNo ?? "–",
        displayTaxInvoiceNo(item),
        item.counterparty,
        displayNpwp(item),
        amount(item.dpp),
        amount(item.vat),
        amount(item.total),
      ],
    })
    if (item.returnRef) {
      rows.push({
        kind: "notice",
        text:
          `Peringatan: faktur ${item.documentNo ?? "–"} punya retur terproses ${item.returnRef.documentNo}` +
          (item.returnRef.sourceDocumentNo ? ` atas ${item.returnRef.sourceDocumentNo}` : "") +
          `. Angka DPP/PPN retur belum mengurangi laporan ini — nota retur mengurangi ` +
          `PPN pada masa retur, menunggu vonis masa & dasar hitung.`,
      })
    }
  }
  return rows
}

function subtotalRow(label: string, group: VatInvoiceGroup): TableRow {
  return {
    kind: "total",
    label,
    cells: [amount(group.dpp), amount(group.vat), amount(group.total)],
  }
}

export function buildVatInvoiceList(input: {
  output: VatInvoiceInput[]
  input: VatInvoiceInput[]
  /** Baris pengurang masa retur (sisi jual saja). */ returnDeductions?: VatReturnDeductionInput[]
}): VatInvoiceListResult {
  const outputItems = sortByDate(input.output)
  const inputItems = sortByDate(input.input)
  const output = summarize(outputItems)
  const inputGroup = summarize(inputItems)

  const rows: TableRow[] = []

  rows.push({ kind: "group", label: `PPN Keluaran — Faktur Penjualan (${output.count})` })
  if (outputItems.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada faktur penjualan ber-PPN pada periode ini." })
  } else {
    rows.push(...dataRows(outputItems))
    rows.push(subtotalRow("Jumlah PPN Keluaran", output))
  }

  rows.push({ kind: "group", label: `PPN Masukan — Faktur Pembelian (${inputGroup.count})` })
  if (inputItems.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada faktur pembelian ber-PPN pada periode ini." })
  } else {
    rows.push(...dataRows(inputItems))
    rows.push(subtotalRow("Jumlah PPN Masukan", inputGroup))
  }

  const deductionItems = sortByDate(input.returnDeductions ?? [])
  const deductionWithTotal = deductionItems.map((d) => ({ ...d, total: safeAdd(d.dpp, d.vat, 2) }))
  const returnDeduction = { ...summarize(deductionWithTotal), count: deductionItems.length }
  const outputNetVat = safeSubtract(output.vat, returnDeduction.vat, 2)

  if (deductionItems.length > 0) {
    rows.push({ kind: "group", label: `Pengurang Masa Retur — Nota Retur Penjualan (${returnDeduction.count})` })
    rows.push(...dataRows(deductionWithTotal))
    rows.push(subtotalRow("Jumlah Pengurang Masa Retur", { ...returnDeduction, total: returnDeduction.total }))
    rows.push({
      kind: "notice",
      text:
        "Baris pengurang di atas adalah nota retur penjualan terproses pada masa ini: " +
        "DPP-retur = qty × harga baris retur (beku dari faktur asal), PPN-retur memakai tarif " +
        "efektif faktur asal. Baris faktur asal di kelompok PPN Keluaran tidak diubah.",
    })
  }

  const netVat = safeSubtract(outputNetVat, inputGroup.vat, 2)
  const missingTaxInvoiceCount =
    outputItems.filter((item) => !hasTaxInvoiceNo(item)).length +
    inputItems.filter((item) => !hasTaxInvoiceNo(item)).length
  const returnedInvoiceCount =
    outputItems.filter((item) => item.returnRef).length +
    inputItems.filter((item) => item.returnRef).length
  rows.push({
    kind: "total",
    grand: true,
    label: "Posisi PPN (Keluaran − Masukan)",
    cells: [
      amount(safeSubtract(output.dpp, inputGroup.dpp, 2)),
      amount(netVat),
      amount(safeSubtract(output.total, inputGroup.total, 2)),
    ],
  })

  if (output.count === 0 && inputGroup.count === 0) {
    rows.push({
      kind: "notice",
      text:
        "Tidak ada faktur ber-PPN pada periode ini, jadi SPT Masa PPN tidak memuat apa pun. " +
        "Pastikan faktur sudah diposting dan tanggalnya masuk periode yang dipilih.",
    })
  } else if (missingTaxInvoiceCount > 0) {
    rows.push({
      kind: "notice",
      text:
        `Kolom Nomor Faktur Pajak memuat nomor faktur pajak (e-Faktur/Coretax) bila tercatat; ` +
        `${missingTaxInvoiceCount} faktur belum punya nomor faktur pajak sehingga kolomnya kembali ke nomor dokumen internal. ` +
        `DPP = subtotal − diskon (nilai sebelum pajak).`,
    })
  } else {
    rows.push({
      kind: "notice",
      text:
        "Kolom Nomor Faktur Pajak memuat nomor faktur pajak (e-Faktur/Coretax) tiap dokumen. " +
        "DPP = subtotal − diskon (nilai sebelum pajak).",
    })
  }

  if (returnedInvoiceCount > 0 && returnDeduction.count === 0) {
    rows.push({
      kind: "notice",
      text:
        `${returnedInvoiceCount} faktur pada periode ini punya retur terproses. ` +
        `DPP/PPN pada laporan ini masih nilai faktur asal; pengurangan karena nota retur ` +
        `dihitung pada masa retur.`,
    })
  }

  const verdict =
    output.count === 0 && inputGroup.count === 0
      ? "Tidak ada faktur ber-PPN pada periode ini"
      : `PPN keluaran ${output.count} faktur · PPN masukan ${inputGroup.count} faktur · ` +
        `posisi ${netVat >= 0 ? "kurang" : "lebih"} bayar ${formatCurrency(Math.abs(netVat))}` +
        (missingTaxInvoiceCount > 0 ? ` · ${missingTaxInvoiceCount} tanpa nomor faktur pajak` : "") +
        (returnedInvoiceCount > 0 ? ` · ${returnedInvoiceCount} faktur ber-retur` : "") +
        (returnDeduction.count > 0 ? ` · pengurang retur ${formatCurrency(returnDeduction.vat)}` : "")

  return {
    table: { columns: COLUMNS, rows },
    output,
    input: inputGroup,
    missingTaxInvoiceCount,
    returnedInvoiceCount,
    returnDeduction,
    outputNetVat,
    netVat,
    verdict,
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function vatInvoiceSummary(result: VatInvoiceListResult): string {
  if (result.output.count === 0 && result.input.count === 0) {
    return "Tidak ada faktur ber-PPN pada periode ini"
  }
  return (
    `Keluaran ${formatCurrency(result.output.vat)} (${result.output.count} faktur) · ` +
    `Masukan ${formatCurrency(result.input.vat)} (${result.input.count} faktur) · ` +
    `posisi ${result.netVat >= 0 ? "kurang" : "lebih"} bayar ${formatCurrency(Math.abs(result.netVat))}`
  )
}
