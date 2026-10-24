/**
 * Katalog kode objek PPh 4(2) sewa tanah/bangunan (F-051-V + F-055-V).
 *
 * SATU sumber resmi DJP: kode + nama resmi + tarif + masa efektif.
 * Nama snapshot bupot WAJIB dari sini (vonis BOT 4 F-2026-10-22-055-V §2):
 * nama master jenis (WithholdingTaxType.name) DILARANG dipakai sebagai
 * nama kode — satu jenis memuat banyak kode. Kode tanpa nama katalog =
 * FAIL-CLOSED ("nama katalog belum tersedia"), nama tidak pernah dikarang
 * dari string kode.
 *
 * Nama resmi per kode: template BPPU Excel-to-XML resmi DJP
 * (pajak.go.id, diakses 2026-10-22; dikonfirmasi vonis BOT 4 F-055-V §1).
 * Tarif 10% tetap PP 34/2017. Masa efektif terbuka mulai 2025-01-01
 * (era e-Bupot Unifikasi PER-11/PJ/2025; ditetapkan 22-05-2025).
 *
 * Pure (tanpa Prisma/DOM).
 */

export interface Pph42RentObjectCatalogEntry {
  /** Kode objek e-Bupot pola NN-NNN-NN. */
  objectCode: string
  /** Nama resmi DJP per kode — satu-satunya sumber nama snapshot. */
  objectName: string
  /** Tarif resmi (%) — sewa tetap 10 (PP 34/2017). */
  rate: number
  /** Wajib bukti dokumen dasar (F51-3/F55 §1). */
  requiresEvidence: boolean
  /** Efektif dari (inklusif), format YYYY-MM-DD. */
  effectiveFrom: string
  /** Efektif sampai (inklusif) atau null = masih berlaku. */
  effectiveTo: string | null
}

export const PPH42_RENT_OBJECT_CATALOG: readonly Pph42RentObjectCatalogEntry[] = [
  {
    objectCode: "28-403-02",
    objectName: "Persewaan Tanah dan/atau Bangunan",
    rate: 10,
    requiresEvidence: false,
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
  },
  {
    objectCode: "28-403-04",
    objectName:
      "Persewaan Tanah dan/atau Bangunan sehubungan Pelaksanaan Proyek Pemerintah yang Dibiayai dengan Hibah atau Dana Pinjaman Luar Negeri",
    rate: 10,
    requiresEvidence: true,
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
  },
]

/** Hari kalender YYYY-MM-DD dari tanggal (lokal), acuan masa efektif katalog. */
function toCalendarDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Baris katalog yang berlaku untuk kode pada tanggal acuan
 * (withholdingDate — vonis F-055-V §3). Null = kode tidak dikenal ATAU
 * tidak efektif pada tanggal itu; pemanggil menolak fail-closed.
 */
export function findPph42RentCatalogEntry(
  objectCode: string | null | undefined,
  onDate: Date,
): Pph42RentObjectCatalogEntry | null {
  const code = (objectCode ?? "").trim()
  if (code === "") return null
  const day = toCalendarDay(onDate)
  return (
    PPH42_RENT_OBJECT_CATALOG.find(
      (e) => e.objectCode === code && e.effectiveFrom <= day && (e.effectiveTo === null || e.effectiveTo >= day),
    ) ?? null
  )
}

export interface RentObjectEvidence {
  docType: string
  docNumber: string
  docDate: string
  issuer: string
  link: string | null
}

const EVIDENCE_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse + validasi metadata bukti dokumen dasar 28-403-04
 * (vonis BOT 4 F-2026-10-22-055-V §1): format terstruktur
 * `JENIS | NOMOR | TANGGAL(YYYY-MM-DD) | PENERBIT | TAUTAN`.
 * NOMOR + TANGGAL wajib — kosong/tanggal rusak = bukti TIDAK sah,
 * terbit ditolak. Pernyataan sepihak tanpa dokumen sumber dana tidak
 * lolos format ini bila nomor/tanggal dokumen tidak diisi.
 */
export function parseRentObjectEvidence(raw: string | null | undefined): RentObjectEvidence {
  const parts = (raw ?? "").split("|").map((s) => s.trim())
  if (parts.length < 4 || parts.some((p, i) => i < 4 && p === "") ||
      !EVIDENCE_DATE.test(parts[2]) || Number.isNaN(Date.parse(parts[2]))) {
    throw new Error(
      "PPh 4(2) sewa: bukti dokumen dasar wajib format \"JENIS | NOMOR | TANGGAL(YYYY-MM-DD) | PENERBIT | TAUTAN\" dengan nomor dan tanggal dokumen terisi.",
    )
  }
  return {
    docType: parts[0],
    docNumber: parts[1],
    docDate: parts[2],
    issuer: parts[3],
    link: parts[4] ? parts[4] : null,
  }
}
