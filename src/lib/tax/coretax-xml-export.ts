/**
 * Ekspor XML Coretax faktur keluaran — inti backend F-2026-10-23-113-V.
 *
 * Vonis BOT 4 PR #619 (MERGED): ekspor hanya TaxInvoice `out` terbekukan
 * yang lolos gerbang siap-ekspor fail-closed; isi XML = snapshot persis,
 * nol hitung ulang; status DJP hanya dari bukti Coretax, bukan dari berkas
 * terbentuk; idempotensi per (faktur, versi template); elemen wajib tak
 * terpetakan = tolak bernama. Acceptance BOT 6: E113-1..9.
 *
 * Sumber skema SATU-SATUNYA = template resmi DJP "Sample Faktur PK
 * Template v.1.4.xml" (halaman Template XML Coretax, diperbarui 1/03/2025;
 * converter v1.6.1 Keterangan sheet = daftar Mandatory). Dilarang mengarang
 * nama elemen. Berkas ini builder MURNI (tanpa Prisma/DB) — loader di
 * `coretax-xml-export-data.ts` membaca snapshot lalu memanggil builder.
 *
 * Kejujuran label (kontrak data, bukan komentar): berkas lolos gerbang
 * hanya boleh diklaim `siap impor Coretax` (konstanta EXPORT_READY_LABEL) —
 * BUKAN "terkirim/terdaftar di DJP". Ekspor tidak mengubah status apa pun.
 */

import { createHash } from "node:crypto"

import { safeRound, safeSum } from "@/lib/utils/math"
import { usesOtherValueBasis, type TransactionCode } from "@/lib/tax/tax-invoice"

/** Versi template resmi DJP yang dipakai builder ini. Bagian kunci idempotensi. */
export const CORETAX_TEMPLATE_VERSION = "FakturPK-v1.4-2025-03-01"
/** URL halaman resmi DJP tempat template + converter diunduh (akses 2026-10-23). */
export const CORETAX_TEMPLATE_SOURCE_URL =
  "https://www.pajak.go.id/id/reformdjp/coretax/template-xml-dan-converter-excel-ke-xml"
/** Label verbatim yang boleh diklaim server/UI — kirim apa adanya, jangan parafrase. */
export const EXPORT_READY_LABEL = "siap impor Coretax"
/** Label verbatim keadaan berkas terbentuk — TIDAK menyatakan status DJP apa pun. */
export const EXPORT_FILE_CREATED_LABEL = "berkas XML dibentuk"
/** Batas batching operasional DJP (keterangan upload XML); BUKAN validasi regulasi. */
export const CORETAX_BATCH_MAX = 100

export type ExportRejectionCode =
  | "NOT_OUTPUT"
  | "CANCELLED_OR_REPLACED"
  | "MISSING_TAX_INVOICE_NUMBER"
  | "SOURCE_NOT_POSTED"
  | "MISSING_SELLER_TIN"
  | "MISSING_SELLER_IDTKU"
  | "MISSING_BUYER_TAX_ID"
  | "MISSING_BUYER_NAME"
  | "MISSING_BUYER_IDTKU"
  | "MISSING_BUYER_ADDRESS"
  | "MISSING_REPLACED_REFERENCE"
  | "CHAIN_HEAD_AND_ORIGIN_SAME_BATCH"
  | "LINE_SUM_MISMATCH"
  | "UNMAPPED_REQUIRED_ELEMENT"
  | "BATCH_TOO_LARGE"

export interface CoretaxExportLineSnapshot {
  /** Deskripsi baris sumber (SalesInvoiceItem.description / nama item). */
  description: string | null
  qty: number
  /** Satuan bebas sumber (SalesInvoiceItem.uom / Item.unitOfMeasure); wajib terpetakan ke UM.*. */
  uom: string | null
  unitPrice: number
  discount: number
  /** Total baris sumber (price × qty − discount) persis tersimpan. */
  total: number
  /** true = jasa (Opt B), false = barang (Opt A). Dari Item.isService sumber. */
  isService: boolean
}

export interface CoretaxExportInvoiceSnapshot {
  taxInvoiceId: number
  direction: string
  transactionCode: string
  taxInvoiceNumber: string | null
  /** Tanggal faktur pajak terbekukan. */
  taxInvoiceDate: Date
  dpp: number
  taxRate: number
  taxAmount: number
  djpStatus: string
  /** Id faktur yang diganti (pengganti), null bila normal. */
  replacesId: number | null
  /** Nomor faktur diganti — wajib untuk pengganti (elemen rujukan template). */
  replacedTaxInvoiceNumber?: string | null
  counterpartyTaxId: string | null
  counterpartyName: string | null
  counterpartyNitku: string | null
  /** Alamat pembeli snapshot (Customer.address); template mewajibkan BuyerAdress. */
  buyerAddress?: string | null
  buyerEmail?: string | null
  /** Status dokumen komersial sumber; harus recognised (posted/partial/paid). */
  sourceStatus: string | null
  /** Keterangan tambahan template (TD.005xx) — wajib kode 07/08, kolom sumber belum ada → tolak bernama. */
  additionalInfo?: string | null
  /** Cap fasilitas template (TD.011xx) — wajib kode 07/08, kolom sumber belum ada → tolak bernama. */
  facilityStamp?: string | null
  lines: CoretaxExportLineSnapshot[]
}

export interface CoretaxExportSellerSnapshot {
  /** NPWP penjual (SystemSetting.companyTaxId) → TIN bulk + SellerIDTKU basis. */
  tin: string | null
  /** NITKU penjual 22 digit dari SystemSetting.companyNitku; kosong → tolak bernama. */
  sellerIdtku: string | null
}

export interface CoretaxExportRejection {
  taxInvoiceId: number
  code: ExportRejectionCode
  /** Pesan Bahasa Indonesia bernama (elemen/syarat yang gugur). */
  reason: string
}

export interface CoretaxExportResult {
  /** XML lengkap, atau null bila tidak ada faktur lolos (fail-closed: tanpa berkas). */
  xml: string | null
  /** SHA-256 isi XML persis; deterministik per (snapshot, versi template). */
  xmlHash: string | null
  templateVersion: string
  /** ID faktur yang benar-benar masuk berkas, urut input. */
  exportedIds: number[]
  rejections: CoretaxExportRejection[]
  /** Selalu EXPORT_READY_LABEL — klaim maksimum yang sah. */
  readyLabel: typeof EXPORT_READY_LABEL
  /** Selalu EXPORT_FILE_CREATED_LABEL saat xml terbentuk; null bila tidak ada berkas. */
  fileCreatedLabel: string | null
}

/**
 * Pemetaan satuan sumber → kode UM.* template resmi (REF-General converter
 * v1.6.1: UM.0018 Unit, UM.0021 Piece, UM.0003 Kilogram, dst). Hanya alias
 * yang terbukti dari referensi itu; satuan lain = elemen wajib tak
 * terpetakan → tolak bernama, dilarang menebak kode.
 */
export const CORETAX_UNIT_CODES: Readonly<Record<string, string>> = {
  PCS: "UM.0021",
  PC: "UM.0021",
  PIECE: "UM.0021",
  UNIT: "UM.0018",
  SET: "UM.0019",
  KG: "UM.0003",
  KILOGRAM: "UM.0003",
  GRAM: "UM.0004",
  LITER: "UM.0007",
  LITRE: "UM.0007",
  METER: "UM.0013",
  M: "UM.0013",
  M2: "UM.0012",
  BOX: "UM.0022",
  BOKS: "UM.0022",
  LUSIN: "UM.0017",
  DOZEN: "UM.0017",
  JAM: "UM.0027",
  HOUR: "UM.0027",
  HARI: "UM.0026",
  DAY: "UM.0026",
  KEGIATAN: "UM.0030",
  LAPORAN: "UM.0031",
  LAINNYA: "UM.0033",
}

/**
 * Bentuk tampil Coretax untuk kode transaksi: kanonik 2 digit sistem,
 * kecuali kode 10 → "010" (satu-satunya pemetaan bentuk yang divonis
 * schema: `Coretax tampil "010" hanya pad untuk kode 10`).
 */
export function coretaxTransactionCodeDisplay(code: string): string {
  return code === "10" ? "010" : code
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function el(name: string, value: string | number | null | undefined, indent: string): string {
  if (value == null || value === "") return `${indent}<${name}/>`
  return `${indent}<${name}>${escapeXml(String(value))}</${name}>`
}

/** Angka sen persis Decimal(15,2) tanpa float: format 2 desimal dari snapshot. */
function money(value: number): string {
  return safeRound(value, 2).toFixed(2)
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const RECOGNISED_SOURCE_STATUSES = new Set(["posted", "partial", "paid"])

function reject(
  out: CoretaxExportRejection[],
  taxInvoiceId: number,
  code: ExportRejectionCode,
  reason: string,
): void {
  out.push({ taxInvoiceId, code, reason })
}

/** Gerbang Putusan 1 per faktur. Mengembalikan true bila boleh masuk XML. */
function passesGate(
  inv: CoretaxExportInvoiceSnapshot,
  seller: CoretaxExportSellerSnapshot,
  rejections: CoretaxExportRejection[],
): boolean {
  const id = inv.taxInvoiceId
  const before = rejections.length
  if (inv.direction !== "out") {
    reject(rejections, id, "NOT_OUTPUT", `Faktur #${id} arah "${inv.direction}" — ekspor XML hanya faktur keluaran (out)`)
  }
  if (inv.djpStatus === "cancelled" || inv.djpStatus === "replaced") {
    reject(
      rejections,
      id,
      "CANCELLED_OR_REPLACED",
      `Faktur #${id} berstatus DJP "${inv.djpStatus}" — faktur batal/yang diganti nol-efek, dilarang diekspor`,
    )
  }
  if (!inv.taxInvoiceNumber?.trim()) {
    reject(rejections, id, "MISSING_TAX_INVOICE_NUMBER", `Faktur #${id} tanpa nomor faktur pajak — nomor lahir di Coretax, ekspor tidak mengarang nomor`)
  }
  if (inv.sourceStatus == null || !RECOGNISED_SOURCE_STATUSES.has(inv.sourceStatus)) {
    reject(
      rejections,
      id,
      "SOURCE_NOT_POSTED",
      `Faktur #${id}: dokumen sumber belum terposting jurnalnya (status "${inv.sourceStatus ?? "tidak ada"}") — hanya faktur terbekukan yang boleh diekspor`,
    )
  }
  if (!seller.tin?.trim()) {
    reject(rejections, id, "MISSING_SELLER_TIN", `Faktur #${id}: NPWP penjual (elemen TIN) belum terisi di pengaturan perusahaan`)
  }
  if (!seller.sellerIdtku?.trim() || !/^\d{22}$/.test(seller.sellerIdtku.trim())) {
    reject(
      rejections,
      id,
      "MISSING_SELLER_IDTKU",
      `Faktur #${id}: elemen wajib SellerIDTKU (NITKU penjual 22 digit) belum terpetakan dari data tersimpan — ekspor ditolak, dilarang mengarang nilai`,
    )
  }
  if (!inv.counterpartyTaxId?.trim()) {
    reject(rejections, id, "MISSING_BUYER_TAX_ID", `Faktur #${id}: NPWP/NIK pembeli (BuyerTin) wajib terisi pada snapshot faktur`)
  }
  if (!inv.counterpartyName?.trim()) {
    reject(rejections, id, "MISSING_BUYER_NAME", `Faktur #${id}: nama pembeli (BuyerName) wajib terisi pada snapshot faktur`)
  }
  if (!inv.buyerAddress?.trim()) {
    reject(
      rejections,
      id,
      "MISSING_BUYER_ADDRESS",
      `Faktur #${id}: elemen wajib BuyerAdress belum terpetakan — alamat pembeli kosong pada data tersimpan, ekspor ditolak bernama`,
    )
  }
  // BuyerIDTKU wajib 22 digit untuk Jenis ID TIN (Keterangan converter v1.6.1).
  if (!inv.counterpartyNitku?.trim() || !/^\d{22}$/.test(inv.counterpartyNitku.trim())) {
    reject(
      rejections,
      id,
      "MISSING_BUYER_IDTKU",
      `Faktur #${id}: elemen wajib BuyerIDTKU (NITKU pembeli 22 digit) belum terpetakan dari snapshot — ekspor ditolak, dilarang mengarang nilai`,
    )
  }
  if ((inv.transactionCode === "07" || inv.transactionCode === "08") && !inv.additionalInfo?.trim()) {
    reject(
      rejections,
      id,
      "UNMAPPED_REQUIRED_ELEMENT",
      `Faktur #${id}: elemen wajib AddInfo (Keterangan Tambahan kode ${inv.transactionCode}) belum terpetakan — tidak ada kolom sumber, ekspor ditolak bernama`,
    )
  }
  if ((inv.transactionCode === "07" || inv.transactionCode === "08") && !inv.facilityStamp?.trim()) {
    reject(
      rejections,
      id,
      "UNMAPPED_REQUIRED_ELEMENT",
      `Faktur #${id}: elemen wajib FacilityStamp (Cap Fasilitas kode ${inv.transactionCode}) belum terpetakan — tidak ada kolom sumber, ekspor ditolak bernama`,
    )
  }
  if (inv.replacesId != null && !inv.replacedTaxInvoiceNumber?.trim()) {
    reject(
      rejections,
      id,
      "MISSING_REPLACED_REFERENCE",
      `Faktur #${id}: faktur pengganti wajib membawa rujukan nomor faktur yang diganti sesuai template resmi`,
    )
  }
  // Rekonsiliasi snapshot: Σ baris (snapshot) wajib sama dengan DPP header
  // terbekukan untuk kode DPP penuh; kode 04 DPP header = 11/12 × Σ baris.
  // Selisih = tolak bernama, BUKAN dibulatkan/disesuaikan diam-diam.
  const lineSum = safeSum(inv.lines.map((l) => l.total), 2)
  const code = inv.transactionCode as TransactionCode
  const expectedDpp = usesOtherValueBasis(code) ? safeRound((lineSum * 11) / 12, 2) : lineSum
  if (Math.abs(safeRound(expectedDpp - inv.dpp, 2)) > 0.005) {
    reject(
      rejections,
      id,
      "LINE_SUM_MISMATCH",
      `Faktur #${id}: Σ baris snapshot (${money(lineSum)}) tidak sama dengan DPP header terbekukan (${money(inv.dpp)}) — ditolak sebagai temuan rekonsiliasi, tanpa penyesuaian diam-diam`,
    )
  }
  if (inv.lines.length === 0) {
    reject(rejections, id, "UNMAPPED_REQUIRED_ELEMENT", `Faktur #${id}: elemen wajib ListOfGoodService kosong — faktur tanpa baris tidak dapat diekspor`)
  }
  for (const [i, line] of inv.lines.entries()) {
    if (!line.description?.trim()) {
      reject(rejections, id, "UNMAPPED_REQUIRED_ELEMENT", `Faktur #${id} baris ${i + 1}: elemen wajib Name (nama barang/jasa) kosong pada snapshot`)
    }
    const unit = line.uom?.trim().toUpperCase()
    if (!unit || !CORETAX_UNIT_CODES[unit]) {
      reject(
        rejections,
        id,
        "UNMAPPED_REQUIRED_ELEMENT",
        `Faktur #${id} baris ${i + 1}: elemen wajib Unit (satuan "${line.uom ?? ""}") belum terpetakan ke kode UM.* template resmi — ekspor ditolak bernama`,
      )
    }
  }
  return rejections.length === before
}

/**
 * Bangun XML TaxInvoiceBulk dari snapshot terbekukan. Deterministik:
 * input snapshot sama → byte sama → hash sama (idempotensi per
 * (faktur, versi template) tanpa peristiwa ganda di lapis ini).
 * Batch kosong / semua tertolak → xml null (fail-closed, tanpa berkas).
 */
export function buildCoretaxOutputXml(
  invoices: CoretaxExportInvoiceSnapshot[],
  seller: CoretaxExportSellerSnapshot,
): CoretaxExportResult {
  const rejections: CoretaxExportRejection[] = []
  if (invoices.length > CORETAX_BATCH_MAX) {
    for (const inv of invoices) {
      reject(
        rejections,
        inv.taxInvoiceId,
        "BATCH_TOO_LARGE",
        `Batch ${invoices.length} faktur melebihi batas batching operasional Coretax ${CORETAX_BATCH_MAX} — pecah batch, bukan validasi regulasi`,
      )
    }
    return emptyResult(rejections)
  }

  // E113-7: asal + pengganti rantai sama dalam satu batch = tolak keduanya.
  const idsInBatch = new Set(invoices.map((i) => i.taxInvoiceId))
  const chainConflict = new Set<number>()
  for (const inv of invoices) {
    if (inv.replacesId != null && idsInBatch.has(inv.replacesId)) {
      chainConflict.add(inv.taxInvoiceId)
      chainConflict.add(inv.replacesId)
    }
  }

  const accepted: CoretaxExportInvoiceSnapshot[] = []
  for (const inv of invoices) {
    if (chainConflict.has(inv.taxInvoiceId)) {
      reject(
        rejections,
        inv.taxInvoiceId,
        "CHAIN_HEAD_AND_ORIGIN_SAME_BATCH",
        `Faktur #${inv.taxInvoiceId}: faktur asal dan penggantinya berada dalam satu batch — ditolak untuk mencegah dobel nilai di Coretax`,
      )
      continue
    }
    if (passesGate(inv, seller, rejections)) accepted.push(inv)
  }

  if (accepted.length === 0) return emptyResult(rejections)

  const tin = seller.tin!.trim()
  const parts: string[] = []
  parts.push(`<?xml version="1.0" encoding="utf-8" ?>`)
  parts.push(
    `<TaxInvoiceBulk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="TaxInvoice.xsd">`,
  )
  parts.push(el("TIN", tin, "\t"))
  parts.push(`\t<ListOfTaxInvoice>`)
  for (const inv of accepted) {
    parts.push(...renderInvoice(inv, seller))
  }
  parts.push(`\t</ListOfTaxInvoice>`)
  parts.push(`</TaxInvoiceBulk>`)
  const xml = parts.join("\n")
  return {
    xml,
    xmlHash: createHash("sha256").update(xml).digest("hex"),
    templateVersion: CORETAX_TEMPLATE_VERSION,
    exportedIds: accepted.map((i) => i.taxInvoiceId),
    rejections,
    readyLabel: EXPORT_READY_LABEL,
    fileCreatedLabel: EXPORT_FILE_CREATED_LABEL,
  }
}

function emptyResult(rejections: CoretaxExportRejection[]): CoretaxExportResult {
  return {
    xml: null,
    xmlHash: null,
    templateVersion: CORETAX_TEMPLATE_VERSION,
    exportedIds: [],
    rejections,
    readyLabel: EXPORT_READY_LABEL,
    fileCreatedLabel: null,
  }
}

function renderInvoice(inv: CoretaxExportInvoiceSnapshot, seller: CoretaxExportSellerSnapshot): string[] {
  const t = "\t\t"
  const tt = "\t\t\t"
  const lines: string[] = []
  lines.push(`${t}<TaxInvoice>`)
  lines.push(el("TaxInvoiceDate", formatDate(inv.taxInvoiceDate), tt))
  // Jenis Faktur: pengganti membawa rujukan faktur diganti; normal = Normal.
  lines.push(el("TaxInvoiceOpt", inv.replacesId != null ? "Replacement" : "Normal", tt))
  lines.push(el("TrxCode", coretaxTransactionCodeDisplay(inv.transactionCode), tt))
  lines.push(el("AddInfo", inv.additionalInfo?.trim() ?? null, tt))
  lines.push(el("CustomDoc", null, tt))
  lines.push(el("CustomDocMonthYear", null, tt))
  // RefDesc membawa rujukan faktur diganti untuk pengganti (nomor persis snapshot).
  lines.push(el("RefDesc", inv.replacesId != null ? inv.replacedTaxInvoiceNumber!.trim() : null, tt))
  lines.push(el("FacilityStamp", inv.facilityStamp?.trim() ?? null, tt))
  lines.push(el("SellerIDTKU", seller.sellerIdtku!.trim(), tt))
  lines.push(el("BuyerTin", inv.counterpartyTaxId!.trim(), tt))
  lines.push(el("BuyerDocument", "TIN", tt))
  lines.push(el("BuyerCountry", "IDN", tt))
  lines.push(el("BuyerDocumentNumber", "-", tt))
  lines.push(el("BuyerName", inv.counterpartyName!.trim(), tt))
  lines.push(el("BuyerAdress", inv.buyerAddress!.trim(), tt))
  lines.push(el("BuyerEmail", inv.buyerEmail?.trim() ?? null, tt))
  lines.push(el("BuyerIDTKU", inv.counterpartyNitku!.trim(), tt))
  lines.push(`${tt}<ListOfGoodService>`)
  const code = inv.transactionCode as TransactionCode
  const otherBasis = usesOtherValueBasis(code)
  for (const line of inv.lines) {
    const g = "\t\t\t\t"
    const gg = "\t\t\t\t\t"
    // Nilai baris = snapshot persis. TaxBase = total baris; OtherTaxBase =
    // DPP nilai lain baris (11/12 untuk kode 04) diturunkan dari snapshot
    // baris yang sama — BUKAN hitung ulang dari master/harga berjalan.
    const taxBase = safeRound(line.total, 2)
    const otherTaxBase = otherBasis ? safeRound((taxBase * 11) / 12, 2) : taxBase
    const vat = safeRound((otherTaxBase * inv.taxRate) / 100, 2)
    lines.push(`${g}<GoodService>`)
    lines.push(el("Opt", line.isService ? "B" : "A", gg))
    lines.push(el("Code", "000000", gg))
    lines.push(el("Name", line.description!.trim(), gg))
    lines.push(el("Unit", CORETAX_UNIT_CODES[line.uom!.trim().toUpperCase()], gg))
    lines.push(el("Price", money(line.unitPrice), gg))
    lines.push(el("Qty", safeRound(line.qty, 2).toFixed(2), gg))
    lines.push(el("TotalDiscount", money(line.discount), gg))
    lines.push(el("TaxBase", money(taxBase), gg))
    lines.push(el("OtherTaxBase", money(otherTaxBase), gg))
    lines.push(el("VATRate", safeRound(inv.taxRate, 2).toFixed(2), gg))
    lines.push(el("VAT", money(vat), gg))
    lines.push(el("STLGRate", "0.00", gg))
    lines.push(el("STLG", "0.00", gg))
    lines.push(`${g}</GoodService>`)
  }
  lines.push(`${tt}</ListOfGoodService>`)
  lines.push(`${t}</TaxInvoice>`)
  return lines
}

/**
 * Kunci idempotensi peristiwa ekspor: (faktur, versi template) → hash isi.
 * Ekspor ulang snapshot sama menghasilkan kunci + hash sama — pemanggil
 * wajib memperlakukannya sebagai replay, bukan peristiwa baru.
 */
export function coretaxExportIdempotencyKey(taxInvoiceId: number, templateVersion: string): string {
  return `coretax-export:${taxInvoiceId}:${templateVersion}`
}
