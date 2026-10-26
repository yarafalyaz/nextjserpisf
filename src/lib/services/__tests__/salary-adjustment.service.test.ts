import { beforeEach, describe, expect, it, vi } from "vitest"

const adjustmentFindMany = vi.fn()
const adjustmentUpdate = vi.fn()
const employeeFindUniqueOrThrow = vi.fn()
const employeeUpdate = vi.fn()

const txMock = {
  $executeRaw: vi.fn(async () => 1),
  salaryAdjustment: {
    findMany: (...a: unknown[]) => adjustmentFindMany(...a),
    update: (...a: unknown[]) => adjustmentUpdate(...a),
  },
  employee: {
    findUniqueOrThrow: (...a: unknown[]) => employeeFindUniqueOrThrow(...a),
    update: (...a: unknown[]) => employeeUpdate(...a),
  },
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: typeof txMock) => unknown) => fn(txMock),
  },
}))

import {
  applyDueSalaryAdjustments,
  computeChangePercent,
} from "@/lib/services/salary-adjustment.service"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("salary adjustments", () => {
  it("computes change percent, including the zero-base case", () => {
    expect(computeChangePercent(4_000_000, 5_000_000)).toBe(25)
    expect(computeChangePercent(5_000_000, 4_500_000)).toBe(-10)
    expect(computeChangePercent(0, 5_000_000)).toBeNull()
  })

  it("applies due adjustments in effective-date order and lands on the newest salary", async () => {
    adjustmentFindMany.mockResolvedValue([
      { id: 1, newBaseSalary: 4_500_000 },
      { id: 2, newBaseSalary: 5_250_000 },
    ])
    employeeFindUniqueOrThrow.mockResolvedValue({ baseSalary: 4_000_000 })

    const applied = await applyDueSalaryAdjustments(7, new Date("2026-02-01"))

    expect(applied).toBe(2)
    // Riwayat berantai: snapshot "sebelum" baris kedua = gaji hasil baris pertama.
    expect(adjustmentUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ previousBaseSalary: 4_000_000, status: "applied" }),
      }),
    )
    expect(adjustmentUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ previousBaseSalary: 4_500_000, status: "applied" }),
      }),
    )
    expect(employeeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { baseSalary: 5_250_000 } }),
    )
    // Kunci argumen where persis (V-SA-6.2 vonis PR #960): baris menunggu/
    // ditolak/applied TIDAK boleh bocor ke penerapan. Mock findMany
    // mengabaikan argumen, jadi tanpa assert ini mutasi cabut filter
    // status hijau diam-diam.
    expect(adjustmentFindMany).toHaveBeenCalledWith({
      where: {
        employeeId: 7,
        status: "scheduled",
        effectiveDate: { lte: new Date("2026-02-01") },
      },
      orderBy: [{ effectiveDate: "asc" }, { id: "asc" }],
    })
  })

  it("does nothing when nothing is due", async () => {
    adjustmentFindMany.mockResolvedValue([])
    const applied = await applyDueSalaryAdjustments(7, new Date("2026-02-01"))
    expect(applied).toBe(0)
    expect(employeeUpdate).not.toHaveBeenCalled()
  })
})
