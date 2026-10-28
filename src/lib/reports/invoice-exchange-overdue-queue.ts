/**
 * F-2026-10-27-101-S tahap 1 — antrean tukar faktur lewat batas kembali.
 *
 * Turunan murni baca-saja: populasi InvoiceExchange `deletedAt = null`
 * dengan `dueDate` lampau (hari kalender WIB) dan sisa serah > epsilon
 * (BR-IEX-01). Satu baris per dokumen tukar faktur (BR-IEX-02) — UI
 * dilarang memecah per faktur.
 *
 * PUTUSAN LEAD Q-IEX-1/2/3 (komentar PR #1163, 27 Okt 2026):
 * - Q-IEX-1: pemicu cukup dueDate lampau; TANPA ambang mengendap tambahan.
 * - Q-IEX-2: kata §1 apa adanya — satu konstanta label server, UI verbatim.
 * - Q-IEX-3: reuse `view_invoice_exchanges` fail-closed, tanpa key baru.
 *
 * VONIS Accountant F-2026-10-27-110-V (PR #1182):
 * - Sisa antrean = sisa SERAH operasional (Σ snapshot `amount` beku saat
 *   serah − Σ `paidAmount` faktur tertaut), BUKAN saldo piutang dokumen.
 * - Wajib sisa faktur HIDUP (Σ grandTotal hidup − paidAmount faktur
 *   non-anomali) + penanda selisih bila beda; selisih = temuan tampil,
 *   bukan dipilih diam-diam.
 * - Faktur cancelled / terhapus (deletedAt) / tertutup retur-kredit penuh
 *   = ember anomali: keluar dari total sisa, TIDAK pernah menyumbang
 *   status Lunas.
 * - Denda/bunga dari dueDate dokumen DILARANG tahap 1.
 *
 * Baca-saja: tanpa jurnal, tanpa ubah status (BR-IEX-06/07).
 * Pure (tanpa Prisma/DOM). Loader: `invoice-exchange-overdue-queue-data.ts`.
 */

import { settlementStatus, type SettlementStatus } from "@/lib/finance/invoice-exchange"
import { isOutstandingSettled } from "@/lib/finance/settlement-status"
import { sumMoney } from "@/lib/reports/aging-amounts"
import { getWibTodayUtcDate, WIB_OFFSET_HOURS } from "@/lib/utils/attendance-time"
import { safeSubtract } from "@/lib/utils/math"

export const INVOICE_EXCHANGE_OVERDUE_TITLE = "Tukar Faktur Lewat Batas"

export const INVOICE_EXCHANGE_OVERDUE_COLUMN_LABELS = {
  document: "Dokumen",
  exchangeDate: "Tanggal Serah",
  customer: "Pelanggan",
  receiptNumber: "Tanda Terima",
  dueDate: "Batas Kembali",
  invoiceCount: "Faktur",
  exchangeValue: "Nilai Serah",
  paid: "Dibayar",
  remaining: "Sisa",
} as const

export const INVOICE_EXCHANGE_OVERDUE_NOTICE_TEXT =
  "Daftar ini hanya tukar faktur yang batas kembalinya sudah lewat dan sisa serahnya belum tertagih. Sisa adalah sisa serah operasional menurut pembayaran faktur tertaut, bukan saldo piutang. Catat pembayaran lewat faktur tertaut existing."

export const INVOICE_EXCHANGE_OVERDUE_NO_DUE_DATE_LABEL = "Tanpa batas kembali"
export const INVOICE_EXCHANGE_OVERDUE_ANOMALY_LABEL = "Faktur tertaut tidak berlaku"
export const INVOICE_EXCHANGE_OVERDUE_ANOMALY_ONLY_LABEL = "Semua faktur tertaut tidak berlaku"
export const INVOICE_EXCHANGE_OVERDUE_DIFFERENCE_LABEL = "Selisih dengan nilai faktur saat ini"

const MS_PER_DAY = 86_400_000
/*
 * Toleransi "sisa lunas" di modul ini = FIN-BR-006 lewat `isOutstandingSettled`
 * (Rp1), BUKAN ambang lokal. Sebelum paritas ini modul menyimpan ambangnya
 * sendiri (setengah sen, 0,005) sehingga antrean menampilkan dokumen yang oleh
 * modul tukar faktur & layar faktur sudah dinyatakan Lunas — dua kebenaran
 * untuk dokumen yang sama.
 */

export interface InvoiceExchangeOverdueInvoiceInput {
  salesInvoiceId: number
  /** Snapshot grandTotal faktur saat diserahkan (beku). */
  exchangedAmount: unknown
  /** Nilai faktur hidup saat baca. */
  grandTotal: unknown
  paidAmount: unknown
  status: string
  deletedAt: Date | null
  /** Kredit retur POSTED atas faktur ini (Rp); 0 bila tidak ada. */
  returnCredit: unknown
}

export interface InvoiceExchangeOverdueInput {
  exchangeId: number
  slug: string | null
  documentNo: string
  date: Date
  customerName: string
  receiptNumber: string | null
  dueDate: Date | null
  deletedAt: Date | null
  invoices: InvoiceExchangeOverdueInvoiceInput[]
}

export interface InvoiceExchangeOverdueRow {
  exchangeId: number
  slug: string | null
  documentNo: string
  date: Date
  customerName: string
  receiptNumber: string | null
  dueDate: Date
  /** Hari kalender WIB sejak dueDate (dueDate kemarin = 1). */
  overdueDays: number
  invoiceCount: number
  /** Σ snapshot amount item (nilai serah beku). */
  exchangedAmount: number
  /** Σ paidAmount faktur non-anomali. */
  paidAmount: number
  /** Sisa serah operasional = snapshot − dibayar (110-V Putusan 1a). */
  remainingAmount: number
  /** Sisa faktur hidup = Σ (grandTotal hidup − paidAmount) non-anomali. */
  liveRemainingAmount: number
  /** remainingAmount − liveRemainingAmount; 0 = selaras. */
  differenceAmount: number
  hasDifference: boolean
  differenceLabel: string | null
  settlementStatus: SettlementStatus
  /** Hitungan faktur anomali (cancelled/terhapus/tertutup retur penuh). */
  anomalyCount: number
  anomalyLabel: string | null
}

export interface InvoiceExchangeOverdueQueue {
  rows: InvoiceExchangeOverdueRow[]
  /** Hitungan dokumen populasi tanpa dueDate (BR-IEX-04) — penanda, bukan baris. */
  withoutDueDateCount: number
  withoutDueDateLabel: string
  /**
   * Dokumen dueDate lampau yang SEMUA fakturnya anomali (cancelled/terhapus/
   * tertutup retur-kredit penuh) sehingga tidak tampil sebagai baris —
   * penanda tingkat antrean (verdict Accountant #1191 catatan minor 1),
   * bukan baris dan tidak masuk totals.
   */
  anomalyOnlyCount: number
  anomalyOnlyLabel: string
  totalDocuments: number
  /** Rekap HANYA atas baris tampil (BR-IEX-10); anomali tidak masuk. */
  totals: {
    exchangedAmount: number
    paidAmount: number
    remainingAmount: number
    liveRemainingAmount: number
    anomalyCount: number
  }
  noticeText: string
}

function wibCalendarDay(instant: Date): Date {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3_600_000)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

function isAnomalyInvoice(invoice: InvoiceExchangeOverdueInvoiceInput): boolean {
  if (invoice.deletedAt !== null) return true
  if (invoice.status === "cancelled") return true
  // Tertutup retur-kredit penuh: kredit retur menutup sisa faktur hidup sampai
  // toleransi lunas FIN-BR-006 (Rp1) — bukan lagi setengah sen.
  const liveRemaining = safeSubtract(invoice.grandTotal as never, invoice.paidAmount as never, 2)
  const credit = Number(invoice.returnCredit ?? 0)
  return (
    credit > 0 &&
    isOutstandingSettled(safeSubtract(liveRemaining, credit, 2)) &&
    !isOutstandingSettled(liveRemaining)
  )
}

export function buildInvoiceExchangeOverdueQueue(
  inputs: InvoiceExchangeOverdueInput[],
  now: Date = new Date(),
): InvoiceExchangeOverdueQueue {
  const today = getWibTodayUtcDate(now)
  const rows: InvoiceExchangeOverdueRow[] = []
  let withoutDueDateCount = 0
  let anomalyOnlyCount = 0

  for (const input of inputs) {
    if (input.deletedAt !== null) continue
    if (input.dueDate === null) {
      // Kosmetik verdict #1191 catatan 2: dokumen lunas penuh tidak dihitung
      // penanda tanpa-dueDate (sisa serah non-anomali <= epsilon). Anomali
      // keluar dari sisa seperti pada baris (110-V) — bukan status Lunas.
      const active = input.invoices.filter((i) => !isAnomalyInvoice(i))
      const remaining = safeSubtract(
        sumMoney(active.map((i) => i.exchangedAmount as never)),
        sumMoney(active.map((i) => i.paidAmount as never)),
        2,
      )
      if (!isOutstandingSettled(remaining)) withoutDueDateCount += 1
      continue
    }
    const dueDay = wibCalendarDay(input.dueDate)
    const overdueDays = Math.round((today.getTime() - dueDay.getTime()) / MS_PER_DAY)
    if (overdueDays < 1) continue

    const active = input.invoices.filter((i) => !isAnomalyInvoice(i))
    const anomalyCount = input.invoices.length - active.length

    const exchangedAmount = sumMoney(active.map((i) => i.exchangedAmount as never))
    const paidAmount = sumMoney(active.map((i) => i.paidAmount as never))
    const remainingAmount = safeSubtract(exchangedAmount, paidAmount, 2)
    if (isOutstandingSettled(remainingAmount)) {
      // Semua faktur anomali -> sisa non-anomali 0; tertanda di tingkat
      // antrean, bukan hilang tanpa jejak (verdict #1191 catatan minor 1).
      if (active.length === 0 && input.invoices.length > 0) anomalyOnlyCount += 1
      continue
    }

    const liveRemainingAmount = sumMoney(
      active.map((i) => safeSubtract(i.grandTotal as never, i.paidAmount as never, 2) as never),
    )
    const differenceAmount = safeSubtract(remainingAmount, liveRemainingAmount, 2)
    const hasDifference = !isOutstandingSettled(Math.abs(differenceAmount))

    rows.push({
      exchangeId: input.exchangeId,
      slug: input.slug,
      documentNo: input.documentNo,
      date: input.date,
      customerName: input.customerName,
      receiptNumber: input.receiptNumber,
      dueDate: input.dueDate,
      overdueDays,
      invoiceCount: active.length,
      exchangedAmount,
      paidAmount,
      remainingAmount,
      liveRemainingAmount,
      differenceAmount,
      hasDifference,
      differenceLabel: hasDifference ? INVOICE_EXCHANGE_OVERDUE_DIFFERENCE_LABEL : null,
      settlementStatus: settlementStatus(exchangedAmount, paidAmount),
      anomalyCount,
      anomalyLabel: anomalyCount > 0 ? INVOICE_EXCHANGE_OVERDUE_ANOMALY_LABEL : null,
    })
  }

  // BR-IEX-10: dueDate paling lampau dulu, seri dueDate = documentNo naik.
  rows.sort((a, b) => {
    const dueDiff = a.dueDate.getTime() - b.dueDate.getTime()
    if (dueDiff !== 0) return dueDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo)
    if (docDiff !== 0) return docDiff
    return a.exchangeId - b.exchangeId
  })

  return {
    rows,
    withoutDueDateCount,
    withoutDueDateLabel: INVOICE_EXCHANGE_OVERDUE_NO_DUE_DATE_LABEL,
    anomalyOnlyCount,
    anomalyOnlyLabel: INVOICE_EXCHANGE_OVERDUE_ANOMALY_ONLY_LABEL,
    totalDocuments: rows.length,
    totals: {
      exchangedAmount: sumMoney(rows.map((r) => r.exchangedAmount as never)),
      paidAmount: sumMoney(rows.map((r) => r.paidAmount as never)),
      remainingAmount: sumMoney(rows.map((r) => r.remainingAmount as never)),
      liveRemainingAmount: sumMoney(rows.map((r) => r.liveRemainingAmount as never)),
      anomalyCount: rows.reduce((s, r) => s + r.anomalyCount, 0),
    },
    noticeText: INVOICE_EXCHANGE_OVERDUE_NOTICE_TEXT,
  }
}
