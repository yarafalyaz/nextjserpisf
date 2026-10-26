/**
 * F-2026-10-25-030-S — alasan kalah terstruktur lead `lost`.
 * Putusan Lead Q-LR-1..4, 26 Okt 2026 07:08 WIB (kartu t_6922de95):
 * - Q-LR-1: kamus lead SENDIRI 8 key terkunci di bawah — BUKAN reuse
 *   `LOST_REASON_CATEGORIES` quotation-outcome (konteks penawaran beda).
 * - Kontrak simpan: awalan `[kalah:key]` di `description` LeadActivity
 *   type=status_change (newStatus=lost), sejajar pola F-2026-10-20-101;
 *   tanpa migrasi/kolom baru tahap 1. Key asing DITOLAK server
 *   (preseden sales.actions.ts rejectQuotation), bukan jatuh diam-diam.
 * - Q-LR-2: kategori WAJIB pada transisi BARU ke lost; teks bebas
 *   opsional maks 2000 char; `lainnya` + teks kosong sah. Lost lama
 *   (tanpa awalan sah) masuk ember `tak-tercatat` — TIDAK pernah
 *   ditebak dari teks bebas (BR-LR-06).
 * - Q-LR-4: won/lost terminal mutlak tahap 1 — transisi keluar dari
 *   keduanya ditolak; koreksi = lead baru.
 *
 * Pure (tanpa Prisma/DOM) — satu sumber kamus untuk server
 * (validasi updateLead), builder corong lead-funnel, dan UI
 * (AC-LR-F1: UI dilarang hardcode kamus kedua).
 */

export const LEAD_LOST_REASON_CATEGORIES = [
  { key: "budget", label: "Budget tidak masuk" },
  { key: "harga", label: "Harga terlalu tinggi" },
  { key: "waktu", label: "Waktu tidak cocok" },
  { key: "tidak-ada-respons", label: "Tidak ada respons" },
  { key: "kalah-kompetitor", label: "Kalah dari kompetitor" },
  { key: "bukan-target", label: "Bukan target pasar" },
  { key: "pembatalan", label: "Pembatalan pelanggan" },
  { key: "lainnya", label: "Lainnya" },
] as const

export type LeadLostReasonCategoryKey =
  (typeof LEAD_LOST_REASON_CATEGORIES)[number]["key"]

/** Ember untuk lead lost tanpa awalan sah (pra-fitur / teks bebas saja). */
export const UNRECORDED_LEAD_LOST_REASON_KEY = "tak-tercatat" as const

export type LeadLostReasonBucketKey =
  | LeadLostReasonCategoryKey
  | typeof UNRECORDED_LEAD_LOST_REASON_KEY

export interface LeadLostReasonBreakdownRow {
  key: LeadLostReasonBucketKey
  label: string
  count: number
}

/** Maks teks bebas alasan kalah (Q-LR-2, pola reason quotation 2000). */
export const LEAD_LOST_REASON_FREE_TEXT_MAX = 2000

const CATEGORY_KEYS = new Set<string>(
  LEAD_LOST_REASON_CATEGORIES.map((c) => c.key),
)

export function isLeadLostReasonCategoryKey(
  value: unknown,
): value is LeadLostReasonCategoryKey {
  return typeof value === "string" && CATEGORY_KEYS.has(value)
}

export function leadLostReasonLabel(key: LeadLostReasonBucketKey): string {
  if (key === UNRECORDED_LEAD_LOST_REASON_KEY) {
    return "Tidak tercatat (lead kalah lama)"
  }
  return LEAD_LOST_REASON_CATEGORIES.find((c) => c.key === key)?.label ?? key
}

/** Awalan terstruktur satu-satunya kontrak agregasi (BR-LR-06). */
export function leadLostReasonPrefix(
  category: LeadLostReasonCategoryKey,
): string {
  return `[kalah:${category}]`
}

/**
 * Susun `description` LeadActivity status_change untuk transisi ke lost:
 * awalan kategori + teks bebas opsional. `parseLeadLostReasonCategory`
 * membaca awalannya kembali — satu kontrak, dua sisi.
 */
export function formatLeadLostReason(input: {
  category: LeadLostReasonCategoryKey
  freeText?: string | null
}): string {
  const freeText = input.freeText?.trim()
  const prefix = leadLostReasonPrefix(input.category)
  return freeText ? `${prefix} ${freeText}` : prefix
}

const LEAD_LOST_REASON_PREFIX_RE = /^\[kalah:([a-z-]+)\]/

/**
 * Baca kategori kalah dari `description` aktivitas. Hanya awalan di
 * posisi 0 yang sah (BR-LR-06); awalan di tengah teks bebas = isi bebas.
 * Tanpa awalan sah di awal -> null (ember `tak-tercatat`, bukan tebakan).
 */
export function parseLeadLostReasonCategory(
  description: string | null | undefined,
): LeadLostReasonCategoryKey | null {
  if (!description) return null
  const match = LEAD_LOST_REASON_PREFIX_RE.exec(description)
  if (!match) return null
  return isLeadLostReasonCategoryKey(match[1]) ? match[1] : null
}

export interface LeadLostActivityLike {
  type?: string
  newStatus?: string | null
  description?: string | null
}

/**
 * Description status_change->lost TERAKHIR. Input diasumsikan urutan
 * kronologis naik (loader lead-funnel orderBy createdAt,id asc).
 */
export function latestLeadLostDescription(
  activities: readonly LeadLostActivityLike[],
): string | null {
  let found: string | null = null
  for (const activity of activities) {
    if (activity.type === "status_change" && activity.newStatus === "lost") {
      found = activity.description ?? null
    }
  }
  return found
}

/**
 * Rincian lost per kategori (Q-LR-3): satu baris per key kamus urutan
 * kanonik (0 tetap tampil agar UI stabil) + ember `tak-tercatat`
 * terakhir. Jumlah semua count = jumlah description yang diberikan.
 */
export function buildLeadLostReasonBreakdown(
  descriptions: readonly (string | null | undefined)[],
): LeadLostReasonBreakdownRow[] {
  const counts = new Map<LeadLostReasonBucketKey, number>()
  for (const description of descriptions) {
    const key =
      parseLeadLostReasonCategory(description) ??
      UNRECORDED_LEAD_LOST_REASON_KEY
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [
    ...LEAD_LOST_REASON_CATEGORIES.map((c) => ({
      key: c.key as LeadLostReasonBucketKey,
      label: c.label,
      count: counts.get(c.key) ?? 0,
    })),
    {
      key: UNRECORDED_LEAD_LOST_REASON_KEY as LeadLostReasonBucketKey,
      label: leadLostReasonLabel(UNRECORDED_LEAD_LOST_REASON_KEY),
      count: counts.get(UNRECORDED_LEAD_LOST_REASON_KEY) ?? 0,
    },
  ]
}

export interface LeadLostTransitionInput {
  fromStatus: string
  /** Status tujuan dari form; null/undefined = status tidak diubah. */
  toStatus?: string | null
  category?: unknown
  freeText?: string | null
}

export type LeadLostTransitionResult =
  | { ok: true; description: string | null }
  | { ok: false; error: string }

/**
 * Penjaga transisi status lead untuk cabang lost (dipakai updateLead).
 * `description` hasil ok=true hanya terisi pada transisi ke lost;
 * transisi lain -> null (aktivitas status_change existing tanpa alasan).
 */
export function validateLeadLostTransition(
  input: LeadLostTransitionInput,
): LeadLostTransitionResult {
  const toStatus = input.toStatus ?? null
  if (toStatus == null || toStatus === input.fromStatus) {
    return { ok: true, description: null }
  }
  // Q-LR-4: terminal mutlak tahap 1.
  if (input.fromStatus === "won") {
    return {
      ok: false,
      error:
        "Lead sudah menang (won) dan bersifat terminal; status tidak dapat diubah.",
    }
  }
  if (input.fromStatus === "lost") {
    return {
      ok: false,
      error:
        "Lead sudah kalah (lost) dan bersifat terminal; status tidak dapat diubah. Buat lead baru bila prospek hidup kembali.",
    }
  }
  if (toStatus !== "lost") return { ok: true, description: null }

  // Q-LR-2 + BR-LR-05: kategori wajib, key asing ditolak eksplisit.
  const category =
    typeof input.category === "string" ? input.category.trim() : ""
  if (!category) {
    return {
      ok: false,
      error:
        "Kategori alasan kalah wajib dipilih saat lead diubah menjadi kalah (lost).",
    }
  }
  if (!isLeadLostReasonCategoryKey(category)) {
    return { ok: false, error: "Kategori alasan kalah tidak dikenal" }
  }
  const freeText =
    typeof input.freeText === "string" ? input.freeText.trim() : ""
  if (freeText.length > LEAD_LOST_REASON_FREE_TEXT_MAX) {
    return {
      ok: false,
      error: `Teks alasan kalah terlalu panjang (maksimal ${LEAD_LOST_REASON_FREE_TEXT_MAX} karakter).`,
    }
  }
  return {
    ok: true,
    description: formatLeadLostReason({ category, freeText }),
  }
}
