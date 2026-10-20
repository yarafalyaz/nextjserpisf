import { describe, it, expect } from "vitest"
import { buildActivityLogWhere } from "../activity-log-filter"

function sp(qs: string): URLSearchParams {
  return new URLSearchParams(qs)
}

describe("buildActivityLogWhere", () => {
  it("no filters → empty where", () => {
    expect(buildActivityLogWhere(sp(""))).toEqual({ ok: true, where: {} })
  })

  it("rejects non-numeric userId", () => {
    expect(buildActivityLogWhere(sp("userId=abc"))).toEqual({
      ok: false,
      message: "userId tidak valid",
    })
  })

  it("rejects non-positive / unsafe userId", () => {
    expect(buildActivityLogWhere(sp("userId=0")).ok).toBe(false)
    expect(buildActivityLogWhere(sp("userId=9007199254740993")).ok).toBe(false)
  })

  it("accepts userId and maps all/ignored filters", () => {
    const r = buildActivityLogWhere(sp("userId=7&action=all&modelType=User&cari=tes"))
    expect(r).toEqual({
      ok: true,
      where: { userId: 7, modelType: "User", description: { contains: "tes" } },
    })
  })

  it("rejects invalid dates instead of silently dropping the filter", () => {
    expect(buildActivityLogWhere(sp("dateFrom=bukan-tanggal"))).toEqual({
      ok: false,
      message: "Tanggal tidak valid",
    })
    expect(buildActivityLogWhere(sp("dateTo=%")).ok).toBe(false)
  })

  it("rejects dateFrom after dateTo", () => {
    expect(buildActivityLogWhere(sp("dateFrom=2026-10-20&dateTo=2026-10-01"))).toEqual({
      ok: false,
      message: "Rentang tanggal tidak valid",
    })
  })

  it("widens dateTo to end of day", () => {
    const r = buildActivityLogWhere(sp("dateFrom=2026-10-01&dateTo=2026-10-20"))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const range = r.where.createdAt as { gte: Date; lte: Date }
    expect(range.gte.toISOString()).toBe(new Date("2026-10-01").toISOString())
    expect(range.lte.getHours()).toBe(23)
    expect(range.lte.getMinutes()).toBe(59)
  })
})
