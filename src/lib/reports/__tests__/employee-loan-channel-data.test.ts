import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  prismaMock: {
    employee: { findMany: vi.fn() },
    employeeLoan: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadEmployeeLoanChannels } from "../employee-loan-channel-data"

describe("loadEmployeeLoanChannels (Q-LS-3b, baca-saja)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.employee.findMany.mockResolvedValue([
      { id: 7, userId: 42 },
    ])
  })

  it("memetakan createdBy→employee dalam satu query massal lalu menurunkan kanal", async () => {
    const channels = await loadEmployeeLoanChannels([
      { id: 1, employeeId: 7, createdBy: 42 },
      { id: 2, employeeId: 8, createdBy: 42 },
      { id: 3, employeeId: 9, createdBy: 99 },
      { id: 4, employeeId: 10, createdBy: null },
    ])

    expect(channels.get(1)).toBe("mandiri")
    expect(channels.get(2)).toBe("titipan")
    expect(channels.get(3)).toBe("titipan")
    expect(channels.get(4)).toBe("titipan")
    expect(mocks.prismaMock.employee.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.employee.findMany).toHaveBeenCalledWith({
      where: { userId: { in: [42, 99] } },
      select: { id: true, userId: true },
    })
    // Loader baca-saja: nol tulis EmployeeLoan.
    expect(mocks.prismaMock.employeeLoan.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.employeeLoan.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.employeeLoan.delete).not.toHaveBeenCalled()
  })

  it("daftar kosong tidak menyentuh DB", async () => {
    const channels = await loadEmployeeLoanChannels([])
    expect(channels.size).toBe(0)
    expect(mocks.prismaMock.employee.findMany).not.toHaveBeenCalled()
  })
})
