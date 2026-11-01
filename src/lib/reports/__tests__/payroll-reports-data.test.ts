import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  findPayrolls: vi.fn(),
  countPayrolls: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    payroll: {
      findMany: (...a: unknown[]) => mocks.findPayrolls(...a),
      count: (...a: unknown[]) => mocks.countPayrolls(...a),
    },
  },
}))

import { loadPayrollRows } from "../payroll-reports-data"

const PERIOD = {
  start: new Date("2026-10-01T00:00:00.000Z"),
  end: new Date("2026-10-31T00:00:00.000Z"),
}

function slip(status: string, baseSalary = 1_000_000, period = "2026-10") {
  return {
    id: 1,
    correctsPayrollId: null,
    period,
    status,
    baseSalary,
    allowances: 0,
    deductions: 0,
    overtimeTotal: 0,
    appreciationTotal: 0,
    loanDeduction: 0,
    lateDeduction: 0,
    absentDeduction: 0,
    bpjsHealthEmployee: 0,
    bpjsEmploymentEmployee: 0,
    pph21: 0,
    grossSalary: baseSalary,
    netSalary: baseSalary,
    employee: { name: "Budi", npwp: null },
  }
}

describe("loadPayrollRows (pushdown status)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findPayrolls.mockResolvedValue([])
    mocks.countPayrolls.mockResolvedValue(0)
  })

  it("findMany menyaring approved/paid di where; draft dihitung count terpisah", async () => {
    mocks.findPayrolls.mockResolvedValue([slip("approved"), slip("paid", 2_000_000, "2026-11")])
    mocks.countPayrolls.mockResolvedValue(4)

    const data = await loadPayrollRows(PERIOD)

    expect(mocks.findPayrolls).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          startDate: { gte: PERIOD.start, lte: PERIOD.end },
          status: { in: ["approved", "paid"] },
        },
      }),
    )
    expect(mocks.countPayrolls).toHaveBeenCalledWith({
      where: {
        startDate: { gte: PERIOD.start, lte: PERIOD.end },
        status: "draft",
      },
    })
    expect(data.rows).toHaveLength(2)
    expect(data.rows.map((r) => r.baseSalary)).toEqual([1_000_000, 2_000_000])
    // draftSlips dari count — identik dengan hitungan filter JS lama.
    expect(data.draftSlips).toBe(4)
    expect(data.duplicateEmployees).toEqual([])
  })

  it("slip asal yang sudah dikoreksi tidak ikut baris (R8-SDM-02) — koreksi mengemban angka penuh", async () => {
    const asal = { ...slip("paid", 6_000_000, "2026-10"), id: 11 }
    const koreksi = { ...slip("paid", 6_500_000, "2026-11"), id: 12, correctsPayrollId: 11 }
    // Rentang memuat keduanya (mis. rekap tahunan): asal dibuang.
    mocks.findPayrolls
      .mockResolvedValueOnce([asal, koreksi])
      // query penunjuk: slip mana yang menunjuk kandidat sebagai asal
      .mockResolvedValueOnce([{ correctsPayrollId: 11 }])
    mocks.countPayrolls.mockResolvedValue(0)

    const data = await loadPayrollRows(PERIOD)

    expect(data.rows).toHaveLength(1)
    expect(data.rows[0].baseSalary).toBe(6_500_000)
    expect(mocks.findPayrolls).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { correctsPayrollId: { in: [11, 12] } },
      }),
    )
  })

  it("slip asal tetap dibuang walau koreksi di luar rentang laporan", async () => {
    const asal = { ...slip("paid", 6_000_000, "2026-10"), id: 11 }
    mocks.findPayrolls
      .mockResolvedValueOnce([asal])
      .mockResolvedValueOnce([{ correctsPayrollId: 11 }])
    mocks.countPayrolls.mockResolvedValue(0)

    const data = await loadPayrollRows(PERIOD)

    expect(data.rows).toHaveLength(0)
  })
})
