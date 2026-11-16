/**
 * Perhitungan progres berbobot tahapan proyek (ERP Internasional / Fabrikasi Overland).
 *
 * - Jika ada tahap yang memiliki `weightPct > 0`, tahap selesai (`completed` /
 *   `skipped`) menyumbang bobotnya, dan tahap `in_progress` menyumbang
 *   `latestPct% * weightPct` (default 50% bila belum ada log persentase).
 * - Jika seluruh `weightPct` null/0 (legacy), tiap tahap berbobot sama rata.
 */

export interface WeightedStageInput {
  status: string
  weightPct?: number | string | { toString(): string } | null
  progress?: Array<{ percentage: number }>
}

export function computeWeightedStagesProgress(
  stages: readonly WeightedStageInput[],
): number {
  if (stages.length === 0) return 0

  const weights = stages.map((s) => {
    if (s.weightPct === null || s.weightPct === undefined) return 0
    const n = Number(s.weightPct)
    return Number.isFinite(n) && n > 0 ? n : 0
  })
  const totalWeight = weights.reduce((acc, w) => acc + w, 0)
  const useCustomWeights = totalWeight > 0

  const effectiveWeights = useCustomWeights
    ? weights
    : stages.map(() => 1)
  const denominator = useCustomWeights ? totalWeight : stages.length

  let earned = 0
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]
    const w = effectiveWeights[i]
    let stagePct = 0
    if (stage.status === "completed" || stage.status === "skipped") {
      stagePct = 100
    } else if (stage.status === "in_progress") {
      stagePct = stage.progress?.[0]?.percentage ?? 50
    }
    earned += (stagePct / 100) * w
  }

  return Math.round((earned / denominator) * 100)
}
