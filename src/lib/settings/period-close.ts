/**
 * Checklist **Proses Akhir Bulan** (tutup buku).
 *
 * Menutup periode menyetel `SystemSetting.periodLockDate` — sejak itu **tidak ada
 * jurnal yang boleh bertanggal pada atau sebelum tanggal kunci** (`assertPeriodOpen`).
 * Karena itu checklist ini bukan formalitas: tiap temuan menjelaskan **apa yang
 * akan terhalang** setelah kunci dipasang (mis. jurnal draft di bulan itu jadi tidak
 * bisa diposting), bukan sekadar "ada N draft".
 *
 * Tidak ada temuan yang saya perlakukan sebagai penghalang mutlak — menutup
 * periode adalah keputusan pengguna, dan ERP ini memakai satu tanggal kunci, bukan
 * penutupan per modul. Jadi statusnya informatif ("ok"/"warn"), bukan "block".
 *
 * Pure (tanpa Prisma/DOM).
 */

export interface PeriodCloseCounts {
  draftJournals: number
  draftSalesInvoices: number
  draftVendorBills: number
  unfinishedReconciliations: number
  draftPayrolls: number
  negativeStockItems: number
}

export interface PeriodCloseInput {
  /** Label bulan yang diperiksa, mis. "September 2026". */
  monthLabel: string
  /** Tanggal yang akan dipakai sebagai kunci periode (akhir bulan). */
  closingDate: Date
  /** Kunci periode yang sedang berlaku, atau null bila belum pernah dikunci. */
  currentLockDate: Date | null
  counts: PeriodCloseCounts
}

export type PeriodLockState = "open" | "this-month" | "beyond" | "before"

export interface PeriodCloseCheck {
  key: keyof PeriodCloseCounts
  title: string
  /** Apa yang dihitung. */
  description: string
  count: number
  status: "ok" | "warn"
  /** Konsekuensi bila dibiarkan saat periode ditutup. */
  guidance: string
}

export interface PeriodCloseResult {
  checks: PeriodCloseCheck[]
  warningCount: number
  monthLabel: string
  lockState: PeriodLockState
  /** Tanggal kunci yang berlaku sekarang (ISO lokal YYYY-MM-DD), atau null. */
  currentLockDate: string | null
  /** True bila sudah terkunci pada/di luar bulan ini sehingga menutup lagi tidak mengubah apa pun. */
  alreadyClosed: boolean
  verdict: string
}

function localDate(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
}

function check(
  key: keyof PeriodCloseCounts,
  count: number,
  title: string,
  description: string,
  guidance: string,
): PeriodCloseCheck {
  return { key, count, title, description, status: count > 0 ? "warn" : "ok", guidance }
}

export function buildPeriodCloseChecks(input: PeriodCloseInput): PeriodCloseResult {
  const { counts } = input

  const checks: PeriodCloseCheck[] = [
    check(
      "draftJournals",
      counts.draftJournals,
      "Jurnal masih draft",
      "Jurnal bertanggal di bulan ini yang belum diposting.",
      "Setelah periode ditutup, jurnal bertanggal pada atau sebelum tanggal kunci tidak bisa lagi diposting — posting dulu, atau pindahkan tanggalnya ke bulan berikutnya.",
    ),
    check(
      "draftSalesInvoices",
      counts.draftSalesInvoices,
      "Faktur penjualan draft",
      "Faktur penjualan bertanggal di bulan ini yang belum diposting.",
      "Faktur draft tidak membukukan pendapatan maupun stok. Bila memang milik bulan ini, posting sebelum menutup; kalau tidak, pendapatannya akan tercatat di bulan lain.",
    ),
    check(
      "draftVendorBills",
      counts.draftVendorBills,
      "Tagihan pembelian draft",
      "Tagihan vendor bertanggal di bulan ini yang belum diposting.",
      "Tagihan draft belum mencatat utang. Tutup periode tanpa memposting berarti beban/utang bulan ini akan bergeser ke bulan berikutnya.",
    ),
    check(
      "unfinishedReconciliations",
      counts.unfinishedReconciliations,
      "Rekonsiliasi bank belum selesai",
      "Rekonsiliasi dengan tanggal rekening koran di bulan ini yang statusnya belum selesai.",
      "Menutup periode dengan rekonsiliasi setengah jalan membuat selisih bank tidak bisa ditelusuri lagi (koreksinya harus bertanggal dalam periode yang sudah terkunci).",
    ),
    check(
      "draftPayrolls",
      counts.draftPayrolls,
      "Slip gaji draft",
      "Slip gaji untuk periode yang dihitung ini yang belum disetujui/dibayar.",
      "Slip draft belum membukukan beban gaji dan utang PPh 21/BPJS. Setujui dan bayar dulu bila memang milik bulan ini.",
    ),
    check(
      "negativeStockItems",
      counts.negativeStockItems,
      "Stok negatif",
      "Barang aktif dengan saldo stok di bawah nol (data tidak wajar).",
      "Stok negatif menandakan pengeluaran melebihi penerimaan; perbaiki lewat penyesuaian stok sebelum angka persediaan dipakai tutup buku.",
    ),
  ]

  const lockState: PeriodLockState = (() => {
    if (!input.currentLockDate) return "open"
    const lock = input.currentLockDate
    const closingY = input.closingDate.getFullYear()
    const closingM = input.closingDate.getMonth()
    const sameMonth = lock.getFullYear() === closingY && lock.getMonth() === closingM
    if (sameMonth) return "this-month"
    if (lock.getTime() > input.closingDate.getTime()) return "beyond"
    return "before"
  })()

  // "before" = kunci lama masih di belakang bulan ini, jadi menutup bulan ini
  // tetap memajukan kunci (bukan "sudah tertutup").
  const alreadyClosed = lockState === "this-month" || lockState === "beyond"

  const warningCount = checks.filter((item) => item.status === "warn").length

  const verdict =
    warningCount === 0
      ? `${input.monthLabel}: tidak ada temuan yang perlu diperiksa — periode siap ditutup.`
      : `${input.monthLabel}: ${warningCount} hal perlu diperiksa sebelum menutup periode.`

  return {
    checks,
    warningCount,
    monthLabel: input.monthLabel,
    lockState,
    currentLockDate: input.currentLockDate ? localDate(input.currentLockDate) : null,
    alreadyClosed,
    verdict,
  }
}
