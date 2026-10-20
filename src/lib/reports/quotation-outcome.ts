/**
 * F-2026-10-20-101 (tahap frontend) — alasan kalah penawaran terstruktur.
 *
 * Tanpa model/kolom baru: kategori kalah dipilih dari kamus tetap khas
 * bengkel saat penawaran ditolak, lalu dikirim sebagai awalan
 * `[kalah:<kategori>]` pada teks `reason` yang sudah ditulis
 * `rejectQuotation` ke `QuotationHistory.description`. Awalan itu
 * satu-satunya kontrak agregasi: ringkasan menang/kalah membaca kategori
 * HANYA dari awalan ini, di posisi mana pun dalam deskripsi.
 *
 * Kerapuhan yang dinyatakan terbuka: penolakan lama (teks bebas tanpa
 * awalan) tidak bisa diklasifikasikan ulang secara jujur — builder
 * mengelompokkannya sebagai `tak-tercatat`, bukan menebak dari isi teks.
 * Kategori juga belum divalidasi ulang di server (aksi masih menerima
 * teks bebas apa pun); validasi server = tahap backend berikutnya.
 *
 * Pure (tanpa Prisma/DOM). Halaman laporan = tahap berikut; modul ini
 * tidak menulis apa pun.
 */

export const LOST_REASON_CATEGORIES = [
  { key: "harga", label: "Harga terlalu tinggi" },
  { key: "waktu-pengerjaan", label: "Waktu pengerjaan terlalu lama" },
  { key: "part-tak-tersedia", label: "Suku cadang tidak tersedia" },
  { key: "pelanggan-menunda", label: "Pelanggan menunda keputusan" },
  { key: "pilih-bengkel-lain", label: "Pilih bengkel lain" },
  { key: "spesifikasi-berubah", label: "Spesifikasi berubah" },
  { key: "lainnya", label: "Lainnya" },
] as const

export type LostReasonCategoryKey = (typeof LOST_REASON_CATEGORIES)[number]["key"]

/** Kategori untuk penolakan lama tanpa awalan terstruktur. */
export const UNRECORDED_LOST_REASON_KEY = "tak-tercatat" as const

export type LostReasonBucketKey = LostReasonCategoryKey | typeof UNRECORDED_LOST_REASON_KEY

const CATEGORY_KEYS = new Set<string>(LOST_REASON_CATEGORIES.map((c) => c.key))

export function isLostReasonCategoryKey(value: unknown): value is LostReasonCategoryKey {
  return typeof value === "string" && CATEGORY_KEYS.has(value)
}

export function lostReasonLabel(key: LostReasonBucketKey): string {
  if (key === UNRECORDED_LOST_REASON_KEY) return "Tidak tercatat (penolakan lama)"
  return LOST_REASON_CATEGORIES.find((c) => c.key === key)?.label ?? key
}

/**
 * Awalan terstruktur kategori kalah untuk `reason` penolakan.
 * `rejectQuotation` menulis teks bebas ini ke `QuotationHistory.description`
 * di belakang kalimat standarnya, dan `parseLostReasonCategory` membaca
 * kembali polanya dari sana — satu kontrak, dua sisi.
 */
export function lostReasonReasonPrefix(category: LostReasonCategoryKey): string {
  return `[kalah:${category}]`
}

const LOST_REASON_PREFIX = /\[kalah:([a-z-]+)\]/

/**
 * Baca kategori kalah dari `description` histori penolakan.
 * Tanpa awalan sah -> null (penolakan lama / teks bebas murni).
 */
export function parseLostReasonCategory(description: string | null | undefined): LostReasonCategoryKey | null {
  if (!description) return null
  const match = LOST_REASON_PREFIX.exec(description)
  if (!match) return null
  return isLostReasonCategoryKey(match[1]) ? match[1] : null
}

/**
 * Susun teks `reason` untuk `rejectQuotation`: awalan kategori + teks bebas
 * opsional. Server membungkusnya menjadi `description` histori
 * ("... — Alasan: <reason>"), dan `parseLostReasonCategory` membaca
 * awalannya kembali dari sana.
 */
export function formatLostReasonReason(input: {
  category: LostReasonCategoryKey
  freeText?: string | null
}): string {
  const freeText = input.freeText?.trim()
  const prefix = lostReasonReasonPrefix(input.category)
  return freeText ? `${prefix} ${freeText}` : prefix
}

export interface QuotationOutcomeInput {
  /** Status akhir penawaran pada akhir periode (accepted/rejected/...). */
  status: string
  /** `description` histori penolakan terbaru; null bila tidak ada. */
  rejectionDescription?: string | null
  /** Penawaran ini sudah punya pesanan penjualan / order kerja turunan. */
  hasConversion: boolean
}

export interface QuotationOutcomeSummary {
  totalQuotations: number
  accepted: number
  rejected: number
  /** Penawaran diterima yang sudah berkonversi ke SO/WO. */
  converted: number
  /** accepted / (accepted + rejected); null bila belum ada keputusan. */
  winRate: number | null
  /** converted / accepted; null bila belum ada yang diterima. */
  conversionRate: number | null
  /** Penolakan per kategori kalah; penolakan lama masuk `tak-tercatat`. */
  lostByCategory: { key: LostReasonBucketKey; label: string; count: number }[]
}

export function buildQuotationOutcomeSummary(
  quotations: QuotationOutcomeInput[],
): QuotationOutcomeSummary {
  let accepted = 0
  let rejected = 0
  let converted = 0
  const lostCounts = new Map<LostReasonBucketKey, number>()
  for (const q of quotations) {
    if (q.status === "accepted") {
      accepted += 1
      if (q.hasConversion) converted += 1
    } else if (q.status === "rejected") {
      rejected += 1
      const key = parseLostReasonCategory(q.rejectionDescription) ?? UNRECORDED_LOST_REASON_KEY
      lostCounts.set(key, (lostCounts.get(key) ?? 0) + 1)
    }
  }
  const decided = accepted + rejected
  return {
    totalQuotations: quotations.length,
    accepted,
    rejected,
    converted,
    winRate: decided > 0 ? accepted / decided : null,
    conversionRate: accepted > 0 ? converted / accepted : null,
    lostByCategory: [...lostCounts.entries()]
      .map(([key, count]) => ({ key, label: lostReasonLabel(key), count }))
      .sort((a, b) => b.count - a.count),
  }
}
