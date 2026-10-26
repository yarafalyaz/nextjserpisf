/**
 * Helper penilaian HCMS murni (tanpa "use server"): dipakai server
 * actions kinerja & suksesi, dan aman diimpor komponen klien/RSC.
 * Berkas actions tidak boleh mengekspor fungsi sinkron — Next menolak
 * ekspor non-async dari modul "use server" begitu ada konsumen UI.
 */

export type SuccessionCoverage = "covered" | "at_risk" | "vacant";

/**
 * Cakupan suksesi satu jabatan dari kandidatnya: ada yang siap sekarang
 * berarti aman; hanya kandidat masa depan berarti berisiko; tanpa
 * kandidat sama sekali berarti kosong.
 */
export function computeSuccessionCoverage(
  candidates: { readiness: string }[],
): SuccessionCoverage {
  if (candidates.length === 0) return "vacant";
  if (candidates.some((c) => c.readiness === "ready_now")) return "covered";
  return "at_risk";
}

/**
 * Skor akhir dari sasaran berbobot: rata-rata tertimbang skor capaian.
 * Sasaran tanpa skor diabaikan; tanpa sasaran ternilai hasilnya null.
 */
export function computeWeightedScore(
  goals: { score: number | null; weight: number }[],
): number | null {
  let weighted = 0;
  let weights = 0;
  for (const g of goals) {
    if (g.score == null) continue;
    weighted += g.score * g.weight;
    weights += g.weight;
  }
  if (weights === 0) return null;
  return Math.round((weighted / weights) * 100) / 100;
}

export const READINESS_LEVELS = ["ready_now", "ready_1_2_years", "ready_future"] as const;

export const READINESS_LABELS: Record<string, string> = {
  ready_now: "Siap Sekarang",
  ready_1_2_years: "Siap 1-2 Tahun",
  ready_future: "Siap Masa Depan",
};

/** Tahapan seleksi pelamar (urutan maju; rejected/hired terminal). */
export const APPLICANT_STAGES = [
  "applied",
  "screening",
  "interview",
  "offering",
  "hired",
  "rejected",
] as const;

export const APPLICANT_STAGE_LABELS: Record<string, string> = {
  applied: "Melamar",
  screening: "Seleksi Berkas",
  interview: "Wawancara",
  offering: "Penawaran",
  hired: "Diterima",
  rejected: "Ditolak",
};

export const SALARY_ADJUSTMENT_REASONS = [
  "berkala",
  "promosi",
  "umk",
  "kinerja",
  "penyesuaian",
  "lainnya",
] as const;

export const SALARY_ADJUSTMENT_REASON_LABELS: Record<string, string> = {
  berkala: "Kenaikan Berkala",
  promosi: "Promosi",
  umk: "Penyesuaian UMK/UMP",
  kinerja: "Kinerja",
  penyesuaian: "Penyesuaian Struktur",
  lainnya: "Lainnya",
};
