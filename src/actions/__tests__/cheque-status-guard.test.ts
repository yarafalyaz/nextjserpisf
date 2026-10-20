import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const requirePermission = vi.fn()
  const logActivity = vi.fn()
  const revalidatePath = vi.fn()
  const assertPeriodOpen = vi.fn()
  const chequeFindFirst = vi.fn()
  const chequeUpdate = vi.fn()
  const chequeUpdateMany = vi.fn()
  const prisma: Record<string, unknown> = {
    account: { count: vi.fn() },
    cheque: { create: vi.fn(), findFirst: chequeFindFirst, update: chequeUpdate, updateMany: chequeUpdateMany },
  }
  return { requirePermission, logActivity, revalidatePath, assertPeriodOpen, chequeFindFirst, chequeUpdate, chequeUpdateMany, prisma }
})

vi.mock("@/lib/db/prisma", async () => (await import("./validation-mock-helpers")).prismaFactory(mocks))
vi.mock("@/lib/auth/permissions", async () => (await import("./validation-mock-helpers")).permissionFactory(mocks))
vi.mock("@/lib/services/activity-log.service", async () => (await import("./validation-mock-helpers")).activityLogFactory(mocks))
vi.mock("next/cache", async () => (await import("./validation-mock-helpers")).revalidateFactory(mocks))
vi.mock("@/lib/services/period-lock.service", async () => (await import("./validation-mock-helpers")).periodLockFactory(mocks))

import { updateChequeStatus, deleteCheque } from "../cheque.actions"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 7 })
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.chequeFindFirst.mockResolvedValue({ id: 1, documentNo: "CHQ-001", dueDate: new Date("2026-10-01"), status: "pending" })
  mocks.chequeUpdateMany.mockResolvedValue({ count: 1 })
  mocks.chequeUpdate.mockResolvedValue({ id: 1 })
})

describe("updateChequeStatus terminal guard", () => {
  it("menolak flip cleared balik ke pending", async () => {
    mocks.chequeFindFirst.mockResolvedValue({ id: 1, documentNo: "CHQ-001", dueDate: new Date("2026-10-01"), status: "cleared" })
    const res = await updateChequeStatus(1, "pending")
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("sudah berakhir")
    expect(mocks.chequeUpdateMany).not.toHaveBeenCalled()
    expect(mocks.chequeUpdate).not.toHaveBeenCalled()
  })

  it("menolak flip cancelled ke cleared", async () => {
    mocks.chequeFindFirst.mockResolvedValue({ id: 1, documentNo: "CHQ-001", dueDate: new Date("2026-10-01"), status: "cancelled" })
    const res = await updateChequeStatus(1, "cleared")
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("sudah berakhir")
    expect(mocks.chequeUpdateMany).not.toHaveBeenCalled()
  })

  it("menolak transisi ke status sama", async () => {
    const res = await updateChequeStatus(1, "pending")
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("sudah 'pending'")
    expect(mocks.chequeUpdateMany).not.toHaveBeenCalled()
  })

  it("mengizinkan pending -> cleared dengan klaim kondisional", async () => {
    const res = await updateChequeStatus(1, "cleared")
    expect(res.success).toBe(true)
    expect(mocks.chequeUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, deletedAt: null, status: "pending" },
      data: { status: "cleared" },
    })
    expect(mocks.chequeUpdate).not.toHaveBeenCalled()
  })

  it("mengizinkan pending -> cancelled", async () => {
    const res = await updateChequeStatus(1, "cancelled")
    expect(res.success).toBe(true)
    expect(mocks.chequeUpdateMany).toHaveBeenCalledOnce()
  })

  it("menolak saat klaim kondisional kalah (status berubah bersamaan)", async () => {
    mocks.chequeUpdateMany.mockResolvedValue({ count: 0 })
    const res = await updateChequeStatus(1, "cleared")
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("berubah status oleh pengguna lain")
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it("FALSIFIKASI: tanpa guard terminal, flip cleared->pending lolos", async () => {
    // Buktikan guard benar-benar bekerja: status cleared + target pending
    // harus gagal SEBELUM update tertulis (klaim kondisional tidak terpanggil).
    mocks.chequeFindFirst.mockResolvedValue({ id: 1, documentNo: "CHQ-001", dueDate: new Date("2026-10-01"), status: "cleared" })
    const blocked = await updateChequeStatus(1, "pending")
    expect(blocked.success).toBe(false)
    expect(mocks.chequeUpdateMany).not.toHaveBeenCalled()
    // Kontrol positif: dari pending, transisi yang sama harus lolos.
    mocks.chequeFindFirst.mockResolvedValue({ id: 1, documentNo: "CHQ-001", dueDate: new Date("2026-10-01"), status: "pending" })
    const allowed = await updateChequeStatus(1, "cleared")
    expect(allowed.success).toBe(true)
    expect(mocks.chequeUpdateMany).toHaveBeenCalledOnce()
  })
})

describe("deleteCheque tetap soft-delete", () => {
  it("menghapus pending lewat deletedAt", async () => {
    const res = await deleteCheque(1)
    expect(res.success).toBe(true)
    expect(mocks.chequeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    )
  })
})
