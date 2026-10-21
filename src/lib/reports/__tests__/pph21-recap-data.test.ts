import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-21-028 loader — yang dijaga:
 * - query payroll difilter startDate rentang (semua status ikut dibaca;
 *   saringan approved/paid milik builder, teruji di pph21-recap.test.ts),
 * - Decimal → number + identitas karyawan dari relasi employee,
 * - tabel masa & tabel tahunan terpilih dibangun dari recap sama.
 */

const mocks = vi.hoisted(() => ({ prismaMock: { payroll: { findMany: vi.fn() } } }))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadPph21Recap } from "../pph21-recap-data"

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const RANGE = { start: D("2026-01-01"), end: D("2026-12-31") }

const row = (o: Record<string, unknown> = {}) => ({
  employeeId: 1, period: "2026-01", status: "approved",
  grossSalary: 10_000_000, pph21: 200_000, netSalary: 9_000_000,
  statutorySnapshot: { pph21Ter: { method: "TER", periodKind: "monthly" } },
  employee: { name: "Andi", npwp: "12.345" }, ...o,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.payroll.findMany.mockResolvedValue([])
})

describe("loadPph21Recap", () => {
  it("query memakai rentang startDate + select pph21/bruto/snapshot/employee", async () => {
    await loadPph21Recap(RANGE)
    expect(mocks.prismaMock.payroll.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { startDate: { gte: RANGE.start, lte: RANGE.end } },
      select: expect.objectContaining({ pph21: true, grossSalary: true, statutorySnapshot: true }),
    }))
  })

  it("draft ikut terbaca loader tapi dibuang builder; tabel masa persis", async () => {
    mocks.prismaMock.payroll.findMany.mockResolvedValue([
      row({}),
      row({ status: "draft", pph21: 999_999 }),
      row({ period: "2026-02", pph21: 210_000, employeeId: 2, employee: { name: "Budi", npwp: null } }),
    ])
    const r = await loadPph21Recap(RANGE)
    expect(r.recap.excludedSlips).toBe(1)
    expect(r.recap.periods.map((p) => [p.period, p.pph21])).toEqual([["2026-01", 200_000], ["2026-02", 210_000]])
    expect(r.periodTable.rows.some((x) => x.kind === "total")).toBe(true)
    expect(r.annualYear).toBe(2026)
    expect(r.annualTable.rows[0]).toMatchObject({ kind: "data" })
  })

  it("annualYear eksplisit dihormati; tanpa data → notice, bukan error", async () => {
    const r = await loadPph21Recap(RANGE, { annualYear: 2024 })
    expect(r.annualYear).toBe(2024)
    expect(r.annualTable.rows.some((x) => x.kind === "notice")).toBe(true)
    expect(r.periodTable.rows.some((x) => x.kind === "notice")).toBe(true)
  })
})
