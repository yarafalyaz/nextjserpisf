import { describe, it, expect, vi, beforeEach } from "vitest"
import { updateEmployeeLoan } from "../hrm.actions"

const mocks = vi.hoisted(() => {
  return {
    prismaMock: {
      employeeLoan: {
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
    },
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermissionMock,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prismaMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidateMock,
}))

vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivityMock,
}))

describe("updateEmployeeLoan bug verification", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  })

  it("should fail when updating a non-active loan (e.g. paid_off)", async () => {
    mocks.prismaMock.employeeLoan.findUniqueOrThrow.mockResolvedValueOnce({
      totalAmount: 10000,
      remainingAmount: 0,
      status: "paid_off",
    })

    const formData = new FormData()
    formData.append("employeeId", "2")
    formData.append("loanDate", "2026-06-15")
    formData.append("totalAmount", "20000")
    formData.append("monthlyInstallment", "1000")

    const res = await updateEmployeeLoan(1, formData)

    expect(res.success).toBe(false)
    expect(res.error).toContain("Hanya pinjaman berstatus aktif yang dapat diedit")
    expect(mocks.prismaMock.employeeLoan.update).not.toHaveBeenCalled()
  })

  it("should allow updating an active loan", async () => {
    mocks.prismaMock.employeeLoan.findUniqueOrThrow.mockResolvedValueOnce({
      totalAmount: 10000,
      remainingAmount: 8000,
      status: "active",
    })
    mocks.prismaMock.employeeLoan.update.mockResolvedValueOnce({ id: 1 })

    const formData = new FormData()
    formData.append("employeeId", "2")
    formData.append("loanDate", "2026-06-15")
    formData.append("totalAmount", "12000")
    formData.append("monthlyInstallment", "1000")

    const res = await updateEmployeeLoan(1, formData)

    expect(res.success).toBe(true)
    expect(mocks.prismaMock.employeeLoan.update).toHaveBeenCalledTimes(1)
    // delta = 12000 - 10000 = 2000 -> remaining 8000 + 2000 = 10000
    expect(mocks.prismaMock.employeeLoan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ remainingAmount: 10000 }),
      })
    )
  })
})
