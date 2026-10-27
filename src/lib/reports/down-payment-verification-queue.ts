/**
 * Builder murni antrean verifikasi DP menunggu konfirmasi
 * (F-2026-10-26-051-S, spec PR #931 merged; gerbang Accountant
 * t_4cc459fb SETUJU + QA t_2cfce04a LOLOS lapis dokumen).
 *
 * Baca-saja turunan: nol kolom/status baru, nol jurnal, nol ubah
 * semantik `confirmDownPayment` dua tahap, nol auto-confirm/tolak
 * (BR-DPQ-08/09). Populasi antrean = DownPayment `status="draft"` saja
 * (BR-DPQ-01; status lahir jalur resmi sales.actions.ts createDownPayment).
 * Status lain (pending warisan / cancelled / confirmed / tak dikenal)
 * TIDAK disamakan draft: terhitung di ember `tak_terklasifikasi`
 * (BR-DPQ-10).
 *
 * Ambang invoice WAJIB snapshot quotation existing lewat helper
 * `resolveInvoiceThresholdPercent` + `computeInvoiceThresholdSen`
 * (src/lib/sales/invoice-threshold.ts) — dilarang konstanta baru,
 * dilarang 50% saklek (BR-DPQ-03). Kumulatif ambang hanya CONFIRMED;
 * DP menunggu tampil sebagai konteks terpisah, tidak dijumlahkan ke
 * confirmedSen (BR-DPQ-04/05). Uang sen integer Math.round(amount*100).
 *
 * Tingkat `menunggu_lama` TIDAK diterbitkan tahap ini: ambang hari
 * Q-DPQ-1 belum diputus Lead, builder tidak menanam angka (BR-DPQ-12,
 * AC-DPQ-8). Hanya dua tingkat: `membuka_invoice` (V1) dan `menunggu`
 * (V3). Urutan baris = input apa adanya (sort daftar = Q-DPQ-3).
 *
 * Umur dari createdAt (BR-DPQ-11), hari kalender WIB, clamp 0 untuk
 * createdAt masa depan (EC-DPQ-4). paymentDate tampil apa adanya
 * sebagai tanggal klaim bayar, bukan acuan umur (EC-DPQ-6).
 * Ada bukti = boolean saja; isi/path proofImage tidak pernah masuk
 * baris (BR-DPQ-07). Deterministik: `now` diinjeksikan pemanggil.
 * Loader: `down-payment-verification-queue-data.ts`.
 */

import {
  computeInvoiceThresholdSen,
  invoiceThresholdSourceLabel,
  resolveInvoiceThresholdPercent,
} from "@/lib/sales/invoice-threshold"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

export const DP_QUEUE_TITLE = "Antrean Verifikasi Uang Muka"

/** Notice usulan spec §1 (kata final Q-DPQ-2 milik Lead). */
export const DP_QUEUE_NOTICE_TEXT =
  "Daftar ini hanya baris uang muka yang belum dikonfirmasi. Nominal di sini belum menjadi kas dan belum terhitung mencapai ambang invoice sampai petugas mengonfirmasi. Jarak ke ambang memakai persen snapshot penawaran masing-masing."

export const DP_QUEUE_LEVELS = ["membuka_invoice", "menunggu"] as const

export type DpQueueLevel = (typeof DP_QUEUE_LEVELS)[number]

/** Label tingkat — usulan spec §1 (kata final Q-DPQ-2 milik Lead). */
export const DP_QUEUE_LEVEL_LABELS: Record<DpQueueLevel, string> = {
  membuka_invoice: "Konfirmasi Membuka Faktur",
  menunggu: "Menunggu Verifikasi",
}

/** Judul kolom usulan spec §1 (kata final Q-DPQ-2 milik Lead). */
export const DP_QUEUE_COLUMN_TITLES = {
  menunggu: "Menunggu",
  bukti: "Bukti",
  jarakAmbang: "Jarak ke Ambang Faktur",
} as const

export const DP_QUEUE_PROOF_LABELS = {
  ada: "Bukti ada",
  belumAda: "Bukti belum ada",
} as const

const MS_PER_DAY = 86_400_000

/** Input satu baris DownPayment (field existing saja, bukti boolean). */
export interface DownPaymentQueueDpInput {
  downPaymentId: number
  documentNo: string
  quotationId: number
  customerId: number
  customerName: string
  /** Nominal rupiah (Decimal existing dikonversi Number di loader). */
  amount: number
  paymentDate: Date
  paymentMethod: string | null
  /** Boolean ada/tidak — isi/path bukti tidak pernah masuk builder. */
  adaBukti: boolean
  status: string
  createdAt: Date
}

/** Konteks quotation per baris (grandTotal + snapshot ambang existing). */
export interface DownPaymentQueueQuotationInput {
  quotationId: number
  quotationDocumentNo: string
  quotationStatus: string
  /** Grand total rupiah quotation. */
  grandTotal: number
  /** Snapshot Quotation.invoiceThresholdPercent; null/korup = fail-closed helper. */
  invoiceThresholdPercent: number | null
}

export interface DownPaymentQueueRow {
  downPaymentId: number
  documentNo: string
  quotationId: number
  quotationDocumentNo: string
  /** Status quotation verbatim server (EC-DPQ-3: tidak disembunyikan). */
  quotationStatus: string
  customerId: number
  customerName: string
  amount: number
  amountSen: number
  paymentDate: Date
  paymentMethod: string | null
  adaBukti: boolean
  buktiLabel: string
  createdAt: Date
  /** Hari kalender WIB sejak createdAt; clamp 0, tidak pernah negatif. */
  umurMenungguHari: number
  tingkat: DpQueueLevel
  tingkatLabel: string
  /** Persen efektif snapshot (helper existing, fail-closed 50 di dalamnya). */
  persenAmbangEfektif: number
  /** Label sumber verbatim server (AC-DPQ-4); UI menempel apa adanya. */
  ambangSumberLabel: string
  /** Σ sen DP CONFIRMED se-quotation (hanya ini yang dihitung ambang). */
  confirmedSen: number
  /** Σ sen DP draft se-quotation termasuk baris ini (konteks menunggu). */
  menungguSen: number
  /** Σ sen DP draft se-quotation selain baris ini. */
  menungguLainSen: number
  ambangSen: number
  /** ambangSen - confirmedSen; negatif = ambang sudah tercapai. */
  jarakSen: number
  /** True bila grandTotal/ambang 0: jarak tanpa acuan (EC-DPQ-1). */
  tanpaAcuanAmbang: boolean
  /** Teks turunan jarak verbatim server (Frontend menempel apa adanya). */
  jarakTeks: string
}

export interface DownPaymentQueueSummary {
  /** Jumlah baris populasi draft. */
  total: number
  totalAmountSen: number
  membukaInvoice: number
  menunggu: number
  tanpaBukti: number
  /** Baris non-draft yang dilewati loader/builder, terhitung jujur. */
  takTerklasifikasi: number
}

export interface DownPaymentQueue {
  rows: DownPaymentQueueRow[]
  summary: DownPaymentQueueSummary
}

export interface DownPaymentQueueOptions {
  /** Waktu acuan umur; diinjeksikan supaya deterministik (tes). */
  now: Date
}

function toSen(amount: number): number {
  return Math.round(amount * 100)
}

function dayKey(date: Date): number {
  return getWibTodayUtcDate(date).getTime()
}

/**
 * Teks jarak §3: ambang tercapai / cukup dengan baris ini / sisa nominal.
 * Semua angka dari sen builder; UI dilarang menghitung ulang (AC-DPQ-10).
 */
function buildJarakTeks(args: {
  tanpaAcuanAmbang: boolean
  confirmedSen: number
  ambangSen: number
  potensiSen: number
}): string {
  if (args.tanpaAcuanAmbang) {
    return "Tanpa acuan ambang (grand total penawaran 0)"
  }
  if (args.confirmedSen >= args.ambangSen) {
    return "Ambang sudah tercapai (faktur dinilai mesin konfirmasi)"
  }
  if (args.potensiSen <= 0) {
    return "Cukup dengan konfirmasi baris ini"
  }
  return "Belum mencapai ambang faktur"
}

export function buildDownPaymentVerificationQueue(
  downPayments: readonly DownPaymentQueueDpInput[],
  quotations: readonly DownPaymentQueueQuotationInput[],
  options: DownPaymentQueueOptions,
): DownPaymentQueue {
  const today = dayKey(options.now)

  const quotationById = new Map<number, DownPaymentQueueQuotationInput>()
  for (const quotation of quotations) {
    quotationById.set(quotation.quotationId, quotation)
  }

  // Agregat per quotation dihitung dari populasi input apa adanya:
  // confirmed hanya dari status persis "confirmed", menunggu hanya
  // dari "draft" (BR-DPQ-04/05). Status lain tidak masuk keduanya.
  const confirmedSenByQuotation = new Map<number, number>()
  const menungguSenByQuotation = new Map<number, number>()
  let takTerklasifikasi = 0
  for (const dp of downPayments) {
    if (dp.status === "confirmed") {
      confirmedSenByQuotation.set(
        dp.quotationId,
        (confirmedSenByQuotation.get(dp.quotationId) ?? 0) + toSen(dp.amount),
      )
    } else if (dp.status === "draft") {
      menungguSenByQuotation.set(
        dp.quotationId,
        (menungguSenByQuotation.get(dp.quotationId) ?? 0) + toSen(dp.amount),
      )
    } else {
      takTerklasifikasi += 1
    }
  }

  const rows: DownPaymentQueueRow[] = []
  const summary: DownPaymentQueueSummary = {
    total: 0,
    totalAmountSen: 0,
    membukaInvoice: 0,
    menunggu: 0,
    tanpaBukti: 0,
    takTerklasifikasi,
  }

  for (const dp of downPayments) {
    if (dp.status !== "draft") continue
    const quotation = quotationById.get(dp.quotationId)
    // Tanpa konteks quotation tidak ada acuan ambang yang jujur:
    // baris tidak dikarang; loader wajib memasok konteksnya.
    if (!quotation) continue

    const amountSen = toSen(dp.amount)
    const confirmedSen = confirmedSenByQuotation.get(dp.quotationId) ?? 0
    const menungguSen = menungguSenByQuotation.get(dp.quotationId) ?? 0
    const grandTotalSen = toSen(quotation.grandTotal)
    const persenAmbangEfektif = resolveInvoiceThresholdPercent(
      quotation.invoiceThresholdPercent,
    )
    const ambangSen =
      grandTotalSen > 0
        ? computeInvoiceThresholdSen(grandTotalSen, persenAmbangEfektif)
        : 0
    const tanpaAcuanAmbang = grandTotalSen <= 0 || ambangSen <= 0
    const sesudahBarisSen = confirmedSen + amountSen
    const potensiSen = ambangSen - sesudahBarisSen
    // V1 hanya dari konfirmasi baris ini sendiri (BR-DPQ-05); tanpa
    // acuan ambang baris tidak pernah diklaim membuka invoice (EC-DPQ-1).
    // Ambang sudah tercapai oleh CONFIRMED = bukan jasa baris ini
    // (EC-DPQ-2): tingkat menunggu, jarakTeks menyatakan tercapai.
    const tingkat: DpQueueLevel =
      !tanpaAcuanAmbang && confirmedSen < ambangSen && potensiSen <= 0
        ? "membuka_invoice"
        : "menunggu"
    const umurMenungguHari = Math.max(
      0,
      Math.round((today - dayKey(dp.createdAt)) / MS_PER_DAY),
    )

    rows.push({
      downPaymentId: dp.downPaymentId,
      documentNo: dp.documentNo,
      quotationId: dp.quotationId,
      quotationDocumentNo: quotation.quotationDocumentNo,
      quotationStatus: quotation.quotationStatus,
      customerId: dp.customerId,
      customerName: dp.customerName,
      amount: dp.amount,
      amountSen,
      paymentDate: dp.paymentDate,
      paymentMethod: dp.paymentMethod,
      adaBukti: dp.adaBukti,
      buktiLabel: dp.adaBukti
        ? DP_QUEUE_PROOF_LABELS.ada
        : DP_QUEUE_PROOF_LABELS.belumAda,
      createdAt: dp.createdAt,
      umurMenungguHari,
      tingkat,
      tingkatLabel: DP_QUEUE_LEVEL_LABELS[tingkat],
      persenAmbangEfektif,
      ambangSumberLabel: invoiceThresholdSourceLabel(
        quotation.invoiceThresholdPercent,
      ),
      confirmedSen,
      menungguSen,
      menungguLainSen: menungguSen - amountSen,
      ambangSen,
      jarakSen: ambangSen - confirmedSen,
      tanpaAcuanAmbang,
      jarakTeks: buildJarakTeks({
        tanpaAcuanAmbang,
        confirmedSen,
        ambangSen,
        potensiSen,
      }),
    })

    summary.total += 1
    summary.totalAmountSen += amountSen
    if (tingkat === "membuka_invoice") summary.membukaInvoice += 1
    else summary.menunggu += 1
    if (!dp.adaBukti) summary.tanpaBukti += 1
  }

  return { rows, summary }
}
