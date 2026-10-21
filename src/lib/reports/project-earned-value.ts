/**
 * Progres tertimbang proyek (earned value sederhana) — builder murni
 * (F-2026-10-21-031, kontrak spec BOT 5 t_983f6b86 komentar #184
 * BR-031-01..11, A1–A4; sesudah F-030 PR #370).
 *
 * FONDASI READ-ONLY. Fitur EV belum layak tampil sebelum gerbang spec
 * G1 (PR #370 merged) + G2 (bukti pemakaian RAB terkunci, vonis Lead) +
 * G3 (UI RAB live). Builder ini tidak menulis status/jurnal/dokumen.
 *
 * Sumber tunggal, dilarang definisi kedua:
 * - Bobot tahap = output `buildProjectBudget` F-030 APA ADANYA
 *   (perStageBudget/totalBudget/unallocatedBudget). Tidak hitung ulang
 *   qty × cost di sini.
 * - Persen fisik tahap = baris `ProjectStageProgress` TERBARU per tahap
 *   (loader memilih; builder menerima persen final). Tanpa record:
 *   completed/skipped = 100, status lain = 0 (BR-031-04 — fallback 50
 *   ala UI lama DITOLAK untuk EV). Satu sumber: ProjectStageProgress
 *   saja, jangan campur WorkOrderOperation F-020 (BR-031-10).
 * - Biaya aktual = `realizedTotal` F-029 via F-030, total proyek datar.
 *
 * Aturan jujur:
 * - BR-031-02: RAB belum terkunci (budgetLockedAt null) ATAU total ≤ 0
 *   → blok EV absen (semua angka EV null) + notice. Bukan 0%.
 * - BR-031-03: tahap tanpa baris RAB tampil ber-bobot 0 berlabel;
 *   persennya TIDAK masuk progres tertimbang, sisa bobot tidak dibagi
 *   rata. (Pada RAB terkunci unallocatedBudget = 0 secara konstruksi
 *   kunci F-030; ember tetap ditampilkan apa adanya.)
 * - BR-031-05: progres tertimbang = Σ(bobot × persen) / Σ bobot tahap
 *   beranggaran; EV = progres tertimbang × totalBudget.
 * - BR-031-06: CPI hanya level PROYEK = EV / realizedTotal. CPI per
 *   tahap DILARANG ada di output (AC per tahap tidak ada, BR-09 F-030
 *   ditunda) — interface tahap sengaja tanpa field CPI.
 * - BR-031-07: SPI klasik EV/PV TIDAK bisa jujur (tidak ada tanggal
 *   rencana per tahap). Pengganti berlabel: `spiTimeBasis` =
 *   EV / (totalBudget × fraksi waktu startDate→endDate clamp 0..1),
 *   null bila tanggal absen atau endDate ≤ startDate. Field TIDAK
 *   bernama `spi` polos.
 * - BR-031-08: label informatif saja, tidak menahan dokumen apa pun.
 * - BR-031-11: output selalu membawa budgetRevisionNo + budgetLockedAt
 *   + penanda realisasi belum-dialokasi per tahap.
 *
 * Bobot % dibulatkan 2 desimal; selisih pembulatan dikoreksi pada tahap
 * berbobot terbesar supaya Σ bobot beranggaran + bobot belum-teralokasi
 * = 100.00 persis bila totalBudget > 0. Persen tertimbang dihitung dari
 * bobot TAK terbulatkan sen supaya A1 tepat (60/40 × 50/100 = 70.00).
 *
 * Pure (tanpa Prisma/DOM). Loader DB ada di `project-earned-value-data.ts`.
 */

import { safeDivide, safeMultiply, safeRound, safeSubtract, safeSum } from "@/lib/utils/math"
import type { ProjectBudgetResult } from "@/lib/reports/project-budget"

/** Notice RAB belum terkunci — kontrak data, tampilkan apa adanya. */
export const PROJECT_EARNED_VALUE_NOT_LOCKED_NOTICE =
  "RAB belum terkunci — progres tertimbang belum tersedia."

/** Notice proyek tanpa anggaran — kontrak data, tampilkan apa adanya. */
export const PROJECT_EARNED_VALUE_NO_BUDGET_NOTICE =
  "Proyek ini belum memiliki anggaran (RAB) per tahap, sehingga progres tertimbang dan earned value tidak dapat dihitung."

/** Notice proyek tanpa tahap — kontrak data, tampilkan apa adanya. */
export const PROJECT_EARNED_VALUE_NO_STAGES_NOTICE =
  "Proyek ini belum memiliki tahap proyek, sehingga progres tertimbang dan earned value tidak dapat dihitung."

/** Label tahap tanpa baris RAB (BR-031-03) — kontrak data. */
export const PROJECT_EARNED_VALUE_STAGE_NO_BUDGET_LABEL = "tanpa anggaran — bobot 0"

/** Penanda realisasi belum-dialokasi per tahap (BR-031-11) — kontrak data. */
export const PROJECT_EARNED_VALUE_UNALLOCATED_REALIZED_NOTICE =
  "Realisasi belum dialokasi per tahap (F-030 fase a+b) — biaya aktual hanya tersedia sebagai total proyek."

/** Label indeks jadwal basis waktu (BR-031-07) — kontrak data. */
export const PROJECT_EARNED_VALUE_SCHEDULE_LABEL = "SPI (basis waktu proyek)"

/** Label overrun biaya (BR-031-08) — kontrak data. */
export const PROJECT_EARNED_VALUE_OVERRUN_LABEL = "biaya melewati nilai hasil (overrun parsial)"

/** Label RAB terlampaui (BR-031-08) — kontrak data. */
export const PROJECT_EARNED_VALUE_BUDGET_EXCEEDED_LABEL = "RAB terlampaui"

/** Label progres tertinggal lintasan waktu (BR-031-08) — kontrak data. */
export const PROJECT_EARNED_VALUE_BEHIND_LABEL = "progres tertinggal dari lintasan waktu"

// --- Input ---

export interface ProjectEarnedValueStageProgressInput {
  projectStageId: number
  /** Nama tahap (untuk baris bobot 0 yang tidak ada di F-030); boleh null. */
  stageName?: string | null
  /** Status tahap (ProjectStage.status) — fallback persen tanpa record. */
  stageStatus: string
  /**
   * Persen baris ProjectStageProgress terbaru; null = belum ada record.
   * Fallback builder (BR-031-04): completed/skipped → 100, lain → 0.
   */
  latestProgressPercent: number | null
}

export interface ProjectEarnedValueInput {
  budget: ProjectBudgetResult
  /**
   * Tanggal kunci RAB proyek (Project.budgetLockedAt). Loader meneruskan
   * dari query Project sendiri — output F-030 hanya membawa isLocked,
   * sedangkan BR-031-11 wajib menampilkan tanggal kunci persis.
   */
  budgetLockedAt: Date | null
  stageProgress: ProjectEarnedValueStageProgressInput[]
  /** Jadwal proyek bebas (Project.startDate/endDate) untuk SPI basis waktu. */
  startDate: Date | null
  endDate: Date | null
  /** Titik waktu penilaian SPI basis waktu; default = saat loader jalan. */
  asOf: Date
}

// --- Output ---

export interface ProjectEarnedValueStage {
  projectStageId: number
  stageName: string | null
  budgetTotal: number
  /** Bobot % 2 desimal; tahap tanpa anggaran persis 0 berlabel. */
  weightPercent: number
  /** Label "tanpa anggaran — bobot 0" bila budgetTotal = 0, selain itu null. */
  noBudgetLabel: string | null
  /** Persen fisik final (record terbaru, atau fallback status). */
  progressPercent: number
  /** Bobot × persen / Σ bobot beranggaran (%); 0 untuk tahap bobot 0. */
  weightedContributionPercent: number
  /** Persen × anggaran tahap (sen). */
  earnedValue: number
  // BR-031-06: TIDAK ada CPI per tahap di sini — AC per tahap tidak ada.
}

export interface ProjectEarnedValueResult {
  projectId: number
  /** EV boleh tampil (RAB terkunci DAN total > 0). */
  hasEarnedValue: boolean
  /** Notice jujur bila hasEarnedValue false; selain itu null. */
  notice: string | null
  /** Versi RAB acuan (BR-031-11), diteruskan dari F-030. */
  budgetRevisionNo: number
  budgetLockedAt: Date | null
  totalBudget: number
  perStage: ProjectEarnedValueStage[]
  /** Anggaran belum-teralokasi dari F-030 apa adanya (sen + bobot %). */
  unallocatedBudget: number
  unallocatedWeightPercent: number
  /** Σ bobot % tahap beranggaran (target 100.00 pada RAB terkunci). */
  allocatedWeightTotalPercent: number
  /** % selesai tertimbang; null bila EV absen. */
  weightedProgressPercent: number | null
  earnedValue: number | null
  /** = realizedTotal F-029 via F-030 (total proyek, bukan per tahap). */
  actualCost: number
  /** EV / actualCost level proyek; null bila EV absen / actualCost = 0. */
  cpi: number | null
  /** Label BR-031-08 yang aktif (informatif, tanpa blokir). */
  labels: string[]
  /** Penanda realisasi belum-dialokasi (BR-031-11), selalu terisi. */
  unallocatedRealizedNotice: string
  /** Nilai terencana basis waktu = totalBudget × fraksi waktu; null bila tanggal tak sah. */
  plannedValueTimeBasis: number | null
  /** Indeks jadwal basis waktu; label tampil = PROJECT_EARNED_VALUE_SCHEDULE_LABEL. */
  spiTimeBasis: number | null
  spiTimeBasisLabel: string
}

function resolveProgressPercent(
  record: ProjectEarnedValueStageProgressInput | undefined,
): number {
  if (!record) return 0
  if (record.latestProgressPercent !== null) {
    return clampPercent(record.latestProgressPercent)
  }
  // BR-031-04: tanpa record, hanya status final yang bernilai 100.
  return record.stageStatus === "completed" || record.stageStatus === "skipped" ? 100 : 0
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function buildProjectEarnedValue(
  input: ProjectEarnedValueInput,
): ProjectEarnedValueResult {
  const { budget } = input
  const totalBudget = budget.totalBudget
  const locked = input.budgetLockedAt !== null && budget.isLocked
  const hasStages =
    budget.perStageBudget.length > 0 || input.stageProgress.length > 0
  const hasEarnedValue = locked && totalBudget > 0 && hasStages

  const progressByStage = new Map(input.stageProgress.map((s) => [s.projectStageId, s]))

  // Semua tahap F-030 urut sortOrder tahap sudah dijamin builder F-030;
  // tahap tanpa baris RAB tidak ada di perStageBudget, jadi loader wajib
  // meneruskan daftar tahap proyek lewat stageProgress — tahap yang tidak
  // terdaftar di perStageBudget ditambahkan sebagai baris bobot 0.
  const budgetStageIds = new Set(budget.perStageBudget.map((s) => s.projectStageId))
  const zeroBudgetStages: ProjectEarnedValueStage[] = input.stageProgress
    .filter((s) => !budgetStageIds.has(s.projectStageId))
    .map((s) => ({
      projectStageId: s.projectStageId,
      stageName: s.stageName ?? null,
      budgetTotal: 0,
      weightPercent: 0,
      noBudgetLabel: PROJECT_EARNED_VALUE_STAGE_NO_BUDGET_LABEL,
      progressPercent: resolveProgressPercent(s),
      weightedContributionPercent: 0,
      earnedValue: 0,
    }))

  if (!hasEarnedValue) {
    return {
      projectId: budget.projectId,
      hasEarnedValue: false,
      notice: !locked
        ? PROJECT_EARNED_VALUE_NOT_LOCKED_NOTICE
        : !hasStages
          ? PROJECT_EARNED_VALUE_NO_STAGES_NOTICE
          : PROJECT_EARNED_VALUE_NO_BUDGET_NOTICE,
      budgetRevisionNo: budget.budgetRevisionNo,
      budgetLockedAt: input.budgetLockedAt,
      totalBudget,
      perStage: [
        ...budget.perStageBudget.map((s) => ({
          projectStageId: s.projectStageId,
          stageName: s.stageName,
          budgetTotal: s.total,
          weightPercent: 0,
          noBudgetLabel:
            s.total > 0 ? null : PROJECT_EARNED_VALUE_STAGE_NO_BUDGET_LABEL,
          progressPercent: resolveProgressPercent(progressByStage.get(s.projectStageId)),
          weightedContributionPercent: 0,
          earnedValue: 0,
        })),
        ...zeroBudgetStages,
      ],
      unallocatedBudget: budget.unallocatedBudget.total,
      unallocatedWeightPercent: 0,
      allocatedWeightTotalPercent: 0,
      weightedProgressPercent: null,
      earnedValue: null,
      actualCost: budget.realizedTotal,
      cpi: null,
      labels: [],
      unallocatedRealizedNotice: PROJECT_EARNED_VALUE_UNALLOCATED_REALIZED_NOTICE,
      plannedValueTimeBasis: null,
      spiTimeBasis: null,
      spiTimeBasisLabel: PROJECT_EARNED_VALUE_SCHEDULE_LABEL,
    }
  }

  // Bobot presisi penuh untuk hitung progres; bobot tampil dibulatkan sen
  // persen dengan koreksi drift di tahap terberat → Σ tampil = 100.00.
  // BR-031-01: bobot = anggaran tahap / totalBudget (termasuk ember
  // belum-teralokasi di penyebut). Progres tertimbang BR-031-05 kemudian
  // menormalisasi atas Σ bobot beranggaran saja.
  const allocatedTotal = safeSum(budget.perStageBudget.map((s) => s.total), 2)
  const rawWeights = budget.perStageBudget.map((s) =>
    safeMultiply(safeDivide(s.total, totalBudget, 8), 100, 6),
  )
  const weights = rawWeights.map((w) => safeRound(w, 2))
  let unallocatedWeight = safeRound(
    safeMultiply(safeDivide(budget.unallocatedBudget.total, totalBudget, 8), 100, 6),
    2,
  )
  const drift = safeSubtract(
    100,
    safeSum([...weights, unallocatedWeight], 2),
    2,
  )
  if (drift !== 0 && weights.length > 0) {
    if (budget.unallocatedBudget.total > Math.max(...budget.perStageBudget.map((s) => s.total))) {
      unallocatedWeight = safeSum([unallocatedWeight, drift], 2)
    } else {
      const largestIdx = rawWeights.indexOf(Math.max(...rawWeights))
      weights[largestIdx] = safeSum([weights[largestIdx], drift], 2)
    }
  }

  const perStage: ProjectEarnedValueStage[] = budget.perStageBudget.map((stage, i) => {
    const progressPercent = resolveProgressPercent(progressByStage.get(stage.projectStageId))
    return {
      projectStageId: stage.projectStageId,
      stageName: stage.stageName,
      budgetTotal: stage.total,
      weightPercent: weights[i],
      noBudgetLabel: stage.total > 0 ? null : PROJECT_EARNED_VALUE_STAGE_NO_BUDGET_LABEL,
      progressPercent,
      weightedContributionPercent:
        allocatedTotal > 0
          ? safeRound(
              safeMultiply(
                safeDivide(stage.total, allocatedTotal, 8),
                progressPercent,
                6,
              ),
              4,
            )
          : 0,
      earnedValue: safeRound(
        safeMultiply(stage.total, safeDivide(progressPercent, 100, 6), 6),
        2,
      ),
    }
  })

  const weightedProgressPercent = safeRound(
    safeSum(perStage.map((s) => s.weightedContributionPercent), 4),
    2,
  )
  const earnedValue = safeSum(perStage.map((s) => s.earnedValue), 2)
  const actualCost = budget.realizedTotal
  const cpi = actualCost > 0 ? safeRound(safeDivide(earnedValue, actualCost, 6), 4) : null

  // SPI basis waktu (BR-031-07): PVwaktu = totalBudget × fraksi waktu.
  let plannedValueTimeBasis: number | null = null
  let spiTimeBasis: number | null = null
  if (
    input.startDate !== null &&
    input.endDate !== null &&
    input.endDate.getTime() > input.startDate.getTime()
  ) {
    const span = input.endDate.getTime() - input.startDate.getTime()
    const elapsed = input.asOf.getTime() - input.startDate.getTime()
    const fraction = Math.min(1, Math.max(0, elapsed / span))
    plannedValueTimeBasis = safeRound(safeMultiply(totalBudget, fraction, 6), 2)
    spiTimeBasis =
      plannedValueTimeBasis > 0
        ? safeRound(safeDivide(earnedValue, plannedValueTimeBasis, 6), 4)
        : null
  }

  const labels: string[] = []
  const isCompletedProject = input.stageProgress.every(
    (s) => s.stageStatus === "completed" || s.stageStatus === "skipped",
  )
  if (cpi !== null && cpi < 1) labels.push(PROJECT_EARNED_VALUE_OVERRUN_LABEL)
  if (budget.realizedTotal > totalBudget) {
    labels.push(PROJECT_EARNED_VALUE_BUDGET_EXCEEDED_LABEL)
  }
  if (spiTimeBasis !== null && spiTimeBasis < 1 && !isCompletedProject) {
    labels.push(PROJECT_EARNED_VALUE_BEHIND_LABEL)
  }

  return {
    projectId: budget.projectId,
    hasEarnedValue: true,
    notice: null,
    budgetRevisionNo: budget.budgetRevisionNo,
    budgetLockedAt: input.budgetLockedAt,
    totalBudget,
    perStage: [...perStage, ...zeroBudgetStages],
    unallocatedBudget: budget.unallocatedBudget.total,
    unallocatedWeightPercent: unallocatedWeight,
    allocatedWeightTotalPercent: safeSum(weights, 2),
    weightedProgressPercent,
    earnedValue,
    actualCost,
    cpi,
    labels,
    unallocatedRealizedNotice: PROJECT_EARNED_VALUE_UNALLOCATED_REALIZED_NOTICE,
    plannedValueTimeBasis,
    spiTimeBasis,
    spiTimeBasisLabel: PROJECT_EARNED_VALUE_SCHEDULE_LABEL,
  }
}
