/**
 * Label + status baca peristiwa perubahan aset (F-2026-10-23-111-V /
 * F-2026-10-23-115-V / gerbang akun F-2026-10-23-128-V).
 *
 * Murni presentasi: nilai peristiwa datang dari baris `AssetChangeEvent`
 * terbekukan (snapshot service) dan ditampilkan apa adanya — komponen ini
 * tidak menghitung nilai wajar/terpulihkan, tidak memilih model, tidak
 * menurunkan jurnal. Mapping kategori NULL = peristiwa terkait ditolak
 * fail-closed oleh service; status belum-terpetakan ditampilkan apa adanya,
 * tidak disembunyikan.
 */

export const ASSET_CHANGE_EVENT_KIND_LABELS: Record<string, string> = {
  REVALUATION_UP: "Revaluasi Naik",
  REVALUATION_DOWN: "Revaluasi Turun",
  IMPAIRMENT: "Penurunan Nilai",
  IMPAIRMENT_REVERSAL: "Pembalikan Penurunan Nilai",
  FISCAL_REVALUATION_APPROVED: "Revaluasi Fiskal Berpersetujuan DJP",
  RECLASSIFICATION: "Reklasifikasi Kategori",
  COMMERCIAL_METHOD_CHANGE: "Perubahan Metode Komersial",
  FISCAL_METHOD_CHANGE: "Perubahan Metode Fiskal",
  ESTIMATE_CHANGE: "Perubahan Estimasi",
}

export const ASSET_CHANGE_EVENT_STATUS_LABELS: Record<string, string> = {
  POSTED: "Terposting",
  REVERSED: "Dibalik",
}

export const IMPAIRMENT_INDICATOR_LABELS: Record<string, string> = {
  PHYSICAL_DAMAGE: "Kerusakan fisik",
  OBSOLESCENCE: "Keusangan",
  DISCONTINUED_USE: "Penggunaan dihentikan",
  CHANGED_USE_PLAN: "Rencana penggunaan berubah",
}

export const RECOVERABLE_BASIS_LABELS: Record<string, string> = {
  FAIR_VALUE_LESS_COSTS: "Nilai wajar kurang biaya pelepasan",
  VALUE_IN_USE: "Nilai pakai",
}

export const RECLASSIFICATION_REASON_LABELS: Record<string, string> = {
  INITIAL_CATEGORY_ERROR: "Kesalahan kategori awal",
  CHANGE_OF_USE: "Perubahan penggunaan",
  LAND_RIGHT_TO_BUILDING: "Hak atas tanah menjadi bangunan",
  TO_INVESTMENT_PROPERTY: "Menjadi properti investasi",
  OTHER_DOCUMENTED: "Lainnya (terdokumentasi)",
}

export const CHANGE_REASON_LABELS: Record<string, string> = {
  CONSUMPTION_PATTERN_CHANGE: "Pola konsumsi manfaat berubah",
  FASTER_WEAR: "Keausan lebih cepat",
  TECHNOLOGY_OBSOLESCENCE: "Keusangan teknologi",
  CAPITAL_IMPROVEMENT_F108: "Kapitalisasi peningkatan (F-108)",
  APPRAISAL_REVIEW: "Penelaahan penilaian",
  OTHER_DOCUMENTED: "Lainnya (terdokumentasi)",
}

export function labelOf(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "-"
  return map[value] ?? value
}

export interface AssetEventAccountMapping {
  revaluationSurplus: { id: number; code: string } | null
  impairmentLoss: { id: number; code: string } | null
  accumulatedImpairment: { id: number; code: string } | null
}

const MAPPING_ROWS: { key: keyof AssetEventAccountMapping; label: string; usedBy: string }[] = [
  { key: "revaluationSurplus", label: "Akun Surplus Revaluasi", usedBy: "revaluasi naik/turun + revaluasi fiskal" },
  { key: "impairmentLoss", label: "Akun Beban Penurunan Nilai", usedBy: "penurunan nilai + pembalikannya" },
  { key: "accumulatedImpairment", label: "Akun Akumulasi Penurunan Nilai", usedBy: "penurunan nilai + pembalikannya" },
]

/**
 * Status pemetaan akun peristiwa per kategori. Baris belum terpetakan tetap
 * tampil berlabel "Belum terpetakan" — peristiwa terkait akan ditolak
 * berisik oleh server (fail-closed F-128-V), bukan disembunyikan dari UI.
 */
export function AssetEventMappingStatus({ mapping }: { mapping: AssetEventAccountMapping }) {
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Status pemetaan akun peristiwa aset">
      {MAPPING_ROWS.map((row) => {
        const account = mapping[row.key]
        return (
          <li key={row.key} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{row.label}:</span>
            {account ? (
              <span className="font-mono text-xs">{account.code}</span>
            ) : (
              <span className="inline-flex rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                Belum terpetakan — peristiwa {row.usedBy} ditolak server
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
