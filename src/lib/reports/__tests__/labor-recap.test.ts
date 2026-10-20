import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Rekap upah borongan per teknisi (F-2026-10-20-97a, read-model aman).
 * Yang dijaga per vonis Salsa 20:47: hanya baris labor, atribusi teknisi
 * hanya lewat join sourceTimesheetId -> Timesheet.employeeId, baris tanpa
 * sumber tampil tanpa teknisi (tidak ditebak), dan rekap informatif saja
 * (notice eksplisit: bukan dasar bayar/jurnal/payroll). Loader dua query
 * massal tanpa N+1.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    productionCost: { findMany: vi.fn() },
    timesheet: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getLaborRecap } from "../labor-recap-data"
import {
  buildLaborRecap,
  LABOR_RECAP_NOTICE,
  type LaborRecapCostInput,
} from "../labor-recap"

function cost(over: Partial<LaborRecapCostInput>): LaborRecapCostInput {
  return { employeeId: 1, employeeName: "Budi", category: "labor", hours: 2, amount: 100_000, ...over }
}

describe("buildLaborRecap", () => {
  it("menjumlah labor per teknisi dari snapshot amount; kategori lain dibuang", () => {
    const r = buildLaborRecap([
      cost({ employeeId: 1, employeeName: "Budi", hours: 2, amount: 100_000 }),
      cost({ employeeId: 1, employeeName: "Budi", hours: 1.5, amount: 75_000 }),
      cost({ employeeId: 2, employeeName: "Andi", hours: 3, amount: 200_000 }),
      cost({ employeeId: 1, employeeName: "Budi", category: "machine", hours: 9, amount: 999_000 }),
      cost({ employeeId: 2, employeeName: "Andi", category: "overhead", hours: 9, amount: 888_000 }),
    ])
    expect(r.technicians).toEqual([
      { employeeId: 2, employeeName: "Andi", laborHours: 3, totalAmount: 200_000, lineCount: 1 },
      { employeeId: 1, employeeName: "Budi", laborHours: 3.5, totalAmount: 175_000, lineCount: 2 },
    ])
    expect(r.totalLaborHours).toBe(6.5)
    expect(r.totalAmount).toBe(375_000)
    expect(r.totalLineCount).toBe(3)
  })

  it("baris tanpa sumber (employeeId null) masuk kelompok tanpa teknisi, tidak ditebak", () => {
    const r = buildLaborRecap([
      cost({ employeeId: 1, employeeName: "Budi", amount: 100_000 }),
      cost({ employeeId: null, employeeName: null, hours: 4, amount: 250_000 }),
      cost({ employeeId: null, employeeName: null, hours: null, amount: 50_000 }),
    ])
    expect(r.technicians).toHaveLength(1)
    expect(r.unattributed).toEqual({ laborHours: 4, totalAmount: 300_000, lineCount: 2 })
    expect(r.totalAmount).toBe(400_000)
    expect(r.totalLineCount).toBe(3)
  })

  it("rekap menyatakan informatif: bukan dasar bayar/jurnal/payroll", () => {
    const r = buildLaborRecap([])
    expect(r.notice).toBe(LABOR_RECAP_NOTICE)
    expect(r.notice).toContain("bukan dasar pembayaran")
    expect(r.notice).toContain("tidak membuat baris payroll")
    expect(r).toMatchObject({ technicians: [], totalAmount: 0, totalLineCount: 0 })
    expect(r.unattributed).toEqual({ laborHours: 0, totalAmount: 0, lineCount: 0 })
  })

  it("jam desimal dibulatkan 2 angka agar drift float tidak bocor", () => {
    const r = buildLaborRecap([
      cost({ hours: 0.1, amount: 1 }),
      cost({ hours: 0.2, amount: 1 }),
    ])
    expect(r.totalLaborHours).toBe(0.3)
    expect(r.technicians[0]?.laborHours).toBe(0.3)
  })
})

describe("getLaborRecap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.productionCost.findMany.mockResolvedValue([
      { sourceTimesheetId: 10, hours: { toString: () => "2.50" }, amount: 150_000 },
      { sourceTimesheetId: 10, hours: 1, amount: 60_000 },
      { sourceTimesheetId: 11, hours: 3, amount: 200_000 },
      { sourceTimesheetId: null, hours: 4, amount: 250_000 },
      { sourceTimesheetId: 99, hours: 5, amount: 300_000 },
    ])
    mocks.prismaMock.timesheet.findMany.mockResolvedValue([
      { id: 10, employeeId: 1, employee: { name: "Budi" } },
      { id: 11, employeeId: 2, employee: { name: "Andi" } },
    ])
  })

  it("dua query massal; join timesheet; timesheet hilang jadi tanpa teknisi", async () => {
    const r = await getLaborRecap()
    expect(mocks.prismaMock.productionCost.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.productionCost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: "labor" } }),
    )
    expect(mocks.prismaMock.timesheet.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.timesheet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [10, 11, 99] } } }),
    )
    expect(r.technicians).toEqual([
      { employeeId: 2, employeeName: "Andi", laborHours: 3, totalAmount: 200_000, lineCount: 1 },
      { employeeId: 1, employeeName: "Budi", laborHours: 3.5, totalAmount: 210_000, lineCount: 2 },
    ])
    // Baris manual (null) + baris timesheet 99 yang sudah hilang: tanpa teknisi.
    expect(r.unattributed).toEqual({ laborHours: 9, totalAmount: 550_000, lineCount: 2 })
    expect(r.totalAmount).toBe(960_000)
  })

  it("tanpa baris bersumber: query timesheet dilewati", async () => {
    mocks.prismaMock.productionCost.findMany.mockResolvedValue([
      { sourceTimesheetId: null, hours: 2, amount: 100_000 },
    ])
    const r = await getLaborRecap()
    expect(mocks.prismaMock.timesheet.findMany).not.toHaveBeenCalled()
    expect(r.technicians).toEqual([])
    expect(r.unattributed).toEqual({ laborHours: 2, totalAmount: 100_000, lineCount: 1 })
  })
})
