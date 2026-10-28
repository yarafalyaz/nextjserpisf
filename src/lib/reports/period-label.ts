/**
 * Label periode untuk laporan rentang, mis. "Periode 1 Jan 2026 – 15 Okt 2026".
 *
 * Bentuk ini sebelumnya disalin di beberapa berkas data laporan (aset, pekerjaan
 * pesanan) — dan salinan ketiga akan lahir untuk pembayaran per bank. Selisih
 * satu huruf saja antar salinan membuat judul laporan berbeda antar halaman,
 * jadi sekarang satu tempat.
 */
import { formatDayMonthYear } from "@/lib/utils/format"

/** Label periode pendek: hari-bulan-tahun, bulan disingkat bahasa Indonesia. */

export function rangePeriodLabel(start: Date, end: Date): string {
  const short = (date: Date) => formatDayMonthYear(date)
  return `Periode ${short(start)} – ${short(end)}`
}

/** Pasangan `periodLabel` + `periodCaption` yang dipakai halaman & PDF. */
export function rangePeriodLabels(period: { start: Date; end: Date }): {
  periodLabel: string
  periodCaption: string
} {
  const label = rangePeriodLabel(period.start, period.end)
  return { periodLabel: label, periodCaption: label }
}
