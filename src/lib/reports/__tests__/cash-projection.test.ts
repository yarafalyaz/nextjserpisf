import { describe, it, expect } from "vitest"
import { projectCash } from "../cash-projection"

describe("projectCash", () => {
  const from = new Date(2026, 9, 1) // Oct 2026

  it("buckets flows into the right month and accumulates closing", () => {
    const rows = projectCash(
      1000,
      from,
      3,
      [
        { dueDate: new Date(2026, 9, 10), amount: 500 }, // Oct
        { dueDate: new Date(2026, 10, 5), amount: 300 }, // Nov
      ],
      [
        { dueDate: new Date(2026, 9, 20), amount: 200 }, // Oct
        { dueDate: new Date(2026, 11, 1), amount: 100 }, // Dec
      ],
    )

    expect(rows.map((r) => r.month)).toEqual(["2026-10", "2026-11", "2026-12"])
    expect(rows[0]).toMatchObject({ label: "Oktober 2026", inflow: 500, outflow: 200, net: 300, closing: 1300 })
    expect(rows[1]).toMatchObject({ inflow: 300, outflow: 0, net: 300, closing: 1600 })
    expect(rows[2]).toMatchObject({ inflow: 0, outflow: 100, net: -100, closing: 1500 })
  })

  it("ignores items outside the projected window", () => {
    const rows = projectCash(0, from, 1, [{ dueDate: new Date(2026, 11, 1), amount: 999 }], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].closing).toBe(0)
  })

  it("returns a flat line when there are no flows", () => {
    const rows = projectCash(250, from, 2, [], [])
    expect(rows.map((r) => r.closing)).toEqual([250, 250])
  })
})
