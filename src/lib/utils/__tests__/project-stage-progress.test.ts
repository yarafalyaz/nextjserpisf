import { describe, expect, it } from "vitest"
import { computeWeightedStagesProgress } from "../project-stage-progress"

describe("computeWeightedStagesProgress", () => {
  it("mengembalikan 0 jika belum ada tahapan", () => {
    expect(computeWeightedStagesProgress([])).toBe(0)
  })

  it("menggunakan bobot sama rata bila weightPct belum diisi (legacy)", () => {
    expect(
      computeWeightedStagesProgress([
        { status: "completed" },
        { status: "in_progress", progress: [{ percentage: 50 }] },
        { status: "pending" },
        { status: "pending" },
      ]),
    ).toBe(38) // (100 + 50 + 0 + 0) / 4 = 37.5 -> 38%
  })

  it("menghitung progres berbobot sesuai weightPct (Fabrikasi Overland)", () => {
    expect(
      computeWeightedStagesProgress([
        { status: "completed", weightPct: 10 },
        { status: "in_progress", weightPct: 40, progress: [{ percentage: 50 }] },
        { status: "pending", weightPct: 30 },
        { status: "pending", weightPct: 20 },
      ]),
    ).toBe(30) // 10 + (0.5 * 40) = 30%
  })

  it("menghitung tahap skipped sebagai 100% selesai", () => {
    expect(
      computeWeightedStagesProgress([
        { status: "completed", weightPct: 60 },
        { status: "skipped", weightPct: 40 },
      ]),
    ).toBe(100)
  })
})
