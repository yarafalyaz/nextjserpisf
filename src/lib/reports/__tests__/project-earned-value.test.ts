import { describe, expect, it } from "vitest"

import {
  PROJECT_EARNED_VALUE_BEHIND_LABEL,
  PROJECT_EARNED_VALUE_NOT_LOCKED_NOTICE,
  PROJECT_EARNED_VALUE_NO_BUDGET_NOTICE,
  PROJECT_EARNED_VALUE_NO_STAGES_NOTICE,
  PROJECT_EARNED_VALUE_OVERRUN_LABEL,
  PROJECT_EARNED_VALUE_BUDGET_EXCEEDED_LABEL,
  PROJECT_EARNED_VALUE_SCHEDULE_LABEL,
  PROJECT_EARNED_VALUE_STAGE_NO_BUDGET_LABEL,
  buildProjectEarnedValue,
} from "@/lib/reports/project-earned-value"
import {
  PROJECT_EARNED_VALUE_LOCKED_AT,
  projectEarnedValueBudgetFixture,
  projectEarnedValueInputFixture,
} from "./project-earned-value-test-fixtures"

const LOCKED_AT = PROJECT_EARNED_VALUE_LOCKED_AT

const budget = projectEarnedValueBudgetFixture
const input = projectEarnedValueInputFixture

describe("buildProjectEarnedValue — F-2026-10-21-031 (spec BOT 5 BR-031-*)", () => {
  it("A1: bobot 60/40 persen 50/100 -> progres tertimbang tepat 70%, EV tepat 70.000.000", () => {
    const r = buildProjectEarnedValue(input())
    expect(r.hasEarnedValue).toBe(true)
    expect(r.perStage.map((s) => s.weightPercent)).toEqual([60, 40])
    expect(r.allocatedWeightTotalPercent).toBe(100)
    expect(r.weightedProgressPercent).toBe(70)
    expect(r.earnedValue).toBe(70_000_000)
    expect(r.perStage.map((s) => s.earnedValue)).toEqual([30_000_000, 40_000_000])
    // Falsifikasi A1: bobot bagi-rata akan memberi (50+100)/2 = 75.
    expect(r.weightedProgressPercent).not.toBe(75)
  })

  it("bobot tampil bulat 2 desimal, drift dikoreksi di tahap terberat, Σ + belum-teralokasi = 100.00", () => {
    const r = buildProjectEarnedValue(
      input({
        budget: budget({
          perStageBudget: [11, 12, 13].map((id) => ({
            projectStageId: id,
            stageName: `T${id}`,
            categories: [],
            total: 1_000_000,
          })),
          unallocatedBudget: { categories: [], total: 0 },
          totalBudget: 3_000_000,
        }),
        stageProgress: [11, 12, 13].map((id) => ({
          projectStageId: id,
          stageStatus: "in_progress",
          latestProgressPercent: 100,
        })),
      }),
    )
    expect(r.perStage.map((s) => s.weightPercent)).toEqual([33.34, 33.33, 33.33])
    expect(
      Math.round((r.allocatedWeightTotalPercent + r.unallocatedWeightPercent) * 100) / 100,
    ).toBe(100)
    expect(r.weightedProgressPercent).toBe(100)
  })

  it("A2: tahap tanpa baris RAB bobot 0 berlabel, progres tertimbang tidak berubah olehnya", () => {
    const withZero = buildProjectEarnedValue(
      input({
        stageProgress: [
          { projectStageId: 11, stageStatus: "in_progress", latestProgressPercent: 50 },
          { projectStageId: 12, stageStatus: "completed", latestProgressPercent: 100 },
          { projectStageId: 99, stageStatus: "in_progress", latestProgressPercent: 80 },
        ],
      }),
    )
    const withoutZero = buildProjectEarnedValue(input())
    const zero = withZero.perStage.find((s) => s.projectStageId === 99)
    expect(zero).toMatchObject({
      weightPercent: 0,
      noBudgetLabel: PROJECT_EARNED_VALUE_STAGE_NO_BUDGET_LABEL,
      weightedContributionPercent: 0,
      earnedValue: 0,
    })
    expect(withZero.weightedProgressPercent).toBe(withoutZero.weightedProgressPercent)
    expect(withZero.earnedValue).toBe(withoutZero.earnedValue)
  })

  it("A2: RAB belum terkunci -> blok EV absen total (null), bukan 0%", () => {
    const r = buildProjectEarnedValue(input({ budgetLockedAt: null, budget: budget({ isLocked: false }) }))
    expect(r.hasEarnedValue).toBe(false)
    expect(r.notice).toBe(PROJECT_EARNED_VALUE_NOT_LOCKED_NOTICE)
    expect(r.weightedProgressPercent).toBeNull()
    expect(r.earnedValue).toBeNull()
    expect(r.cpi).toBeNull()
    expect(r.spiTimeBasis).toBeNull()
  })

  it("acceptance kartu (a): terkunci tapi total anggaran 0 -> notice jujur, tanpa angka karangan", () => {
    const r = buildProjectEarnedValue(
      input({
        budget: budget({ perStageBudget: [], totalBudget: 0, unallocatedBudget: { categories: [], total: 0 } }),
      }),
    )
    expect(r.hasEarnedValue).toBe(false)
    expect(r.notice).toBe(PROJECT_EARNED_VALUE_NO_BUDGET_NOTICE)
    expect(r.earnedValue).toBeNull()
  })

  it("vonis Lead: proyek tanpa tahap -> notice tanpa-tahap, bukan 0%", () => {
    const r = buildProjectEarnedValue(
      input({
        budget: budget({ perStageBudget: [], totalBudget: 0, unallocatedBudget: { categories: [], total: 0 } }),
        stageProgress: [],
      }),
    )
    expect(r.hasEarnedValue).toBe(false)
    expect(r.notice).toBe(PROJECT_EARNED_VALUE_NO_STAGES_NOTICE)
    expect(r.weightedProgressPercent).toBeNull()
  })

  it("BR-031-04: tanpa record progress, completed/skipped=100 selain itu 0 (fallback 50 ditolak)", () => {
    const r = buildProjectEarnedValue(
      input({
        stageProgress: [
          { projectStageId: 11, stageStatus: "in_progress", latestProgressPercent: null },
          { projectStageId: 12, stageStatus: "completed", latestProgressPercent: null },
        ],
      }),
    )
    expect(r.perStage.map((s) => s.progressPercent)).toEqual([0, 100])
    expect(r.weightedProgressPercent).toBe(40)
  })

  it("A3: EV 70jt / realisasi 87,5jt -> CPI tepat 0.80 + label overrun; CPI per tahap absen dari output", () => {
    const r = buildProjectEarnedValue(
      input({ budget: budget({ realizedTotal: 87_500_000, unallocatedRealized: 87_500_000 }) }),
    )
    expect(r.cpi).toBe(0.8)
    expect(r.labels).toContain(PROJECT_EARNED_VALUE_OVERRUN_LABEL)
    expect(r.labels).not.toContain(PROJECT_EARNED_VALUE_BUDGET_EXCEEDED_LABEL)
    for (const stage of r.perStage) {
      expect(stage).not.toHaveProperty("cpi")
      expect(Object.keys(stage)).not.toContain("spiTimeBasis")
    }
  })

  it("A3: realisasi melewati total RAB -> label RAB terlampaui", () => {
    const r = buildProjectEarnedValue(
      input({
        budget: budget({
          realizedTotal: 101_000_000,
          unallocatedRealized: 101_000_000,
          varianceTotal: -1_000_000,
        }),
      }),
    )
    expect(r.labels).toContain(PROJECT_EARNED_VALUE_BUDGET_EXCEEDED_LABEL)
  })

  it("CPI null bila biaya aktual 0 (bukan tebakan tak-hingga)", () => {
    const r = buildProjectEarnedValue(input())
    expect(r.actualCost).toBe(0)
    expect(r.cpi).toBeNull()
    expect(r.labels).toEqual([])
  })

  it("A4: tanggal absen/rusak -> indeks jadwal null; label selalu berkualifikasi basis waktu", () => {
    const noDates = buildProjectEarnedValue(input())
    expect(noDates.plannedValueTimeBasis).toBeNull()
    expect(noDates.spiTimeBasis).toBeNull()
    expect(noDates.spiTimeBasisLabel).toBe(PROJECT_EARNED_VALUE_SCHEDULE_LABEL)
    expect(PROJECT_EARNED_VALUE_SCHEDULE_LABEL).toContain("basis waktu")

    const badDates = buildProjectEarnedValue(
      input({ startDate: new Date(2026, 11, 1), endDate: new Date(2026, 10, 1) }),
    )
    expect(badDates.spiTimeBasis).toBeNull()
  })

  it("A4: fraksi waktu 50% + EV 70jt/total 100jt -> PVwaktu 50jt, SPIw tepat 1.40", () => {
    const r = buildProjectEarnedValue(
      input({
        startDate: new Date(2026, 10, 1), // 2026-11-01
        endDate: new Date(2026, 10, 29), // 2026-11-29; asOf 2026-11-15 = tepat tengah
      }),
    )
    expect(r.plannedValueTimeBasis).toBe(50_000_000)
    expect(r.spiTimeBasis).toBe(1.4)
    expect(r.labels).not.toContain(PROJECT_EARNED_VALUE_BEHIND_LABEL)
  })

  it("BR-031-08: SPIw < 1 -> label tertinggal; proyek selesai tidak dilabeli terlambat", () => {
    const behind = buildProjectEarnedValue(
      input({
        startDate: new Date(2026, 10, 1),
        endDate: new Date(2026, 10, 29),
        stageProgress: [
          { projectStageId: 11, stageStatus: "in_progress", latestProgressPercent: 10 },
          { projectStageId: 12, stageStatus: "pending", latestProgressPercent: 0 },
        ],
      }),
    )
    expect(behind.spiTimeBasis).toBeLessThan(1)
    expect(behind.labels).toContain(PROJECT_EARNED_VALUE_BEHIND_LABEL)
  })

  it("BR-031-11: versi RAB + tanggal kunci + penanda realisasi belum-dialokasi selalu terbawa", () => {
    const r = buildProjectEarnedValue(input())
    expect(r.budgetRevisionNo).toBe(2)
    expect(r.budgetLockedAt).toBe(LOCKED_AT)
    expect(r.unallocatedRealizedNotice).toContain("belum dialokasi per tahap")
  })

  it("anggaran belum-teralokasi F-030 tampil apa adanya, tidak dibagi rata ke tahap", () => {
    const r = buildProjectEarnedValue(
      input({
        budget: budget({
          unallocatedBudget: { categories: [{ category: "lain", amount: 25_000_000 }], total: 25_000_000 },
          totalBudget: 125_000_000,
        }),
      }),
    )
    expect(r.unallocatedBudget).toBe(25_000_000)
    expect(r.unallocatedWeightPercent).toBe(20)
    // BR-031-01: bobot = tahap/totalBudget (125jt) → 48/32, bukan 60/40.
    expect(r.perStage.map((s) => s.weightPercent)).toEqual([48, 32])
    expect(r.allocatedWeightTotalPercent + r.unallocatedWeightPercent).toBe(100)
    // BR-031-05: progres dinormalisasi atas tahap beranggaran saja.
    expect(r.weightedProgressPercent).toBe(70)
  })
})
