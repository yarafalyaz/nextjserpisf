// Label alasan penyesuaian gaji untuk UI. Nilai mentah + label harus tetap
// cermin SALARY_ADJUSTMENT_REASONS / SALARY_ADJUSTMENT_REASON_LABELS di
// src/actions/salary-adjustment.actions.ts (server penegak; berkas "use
// server" tidak bisa diimpor komponen client).
export const SALARY_ADJUSTMENT_REASONS = [
  "berkala",
  "promosi",
  "umk",
  "kinerja",
  "penyesuaian",
  "lainnya",
] as const

export const SALARY_ADJUSTMENT_REASON_LABELS: Record<string, string> = {
  berkala: "Kenaikan Berkala",
  promosi: "Promosi",
  umk: "Penyesuaian UMK/UMP",
  kinerja: "Kinerja",
  penyesuaian: "Penyesuaian Struktur",
  lainnya: "Lainnya",
}
