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
  prisma.$transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma))
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

describe("putaran 75: periode dinilai ulang dalam tx sebelum klaim", () => {
  it("updateChequeStatus ditolak bila periode tertutup saat dinilai ulang dalam tx", async () => {
    // Bacaan pra-tx (argumen kedua undefined) lolos; penilaian ulang dalam
    // tx (argumen kedua = facade tx) melihat tutup periode yang commit di
    // jendela -> klaim tidak boleh berjalan.
    mocks.assertPeriodOpen.mockImplementation(async (_d: unknown, tx?: unknown) => {
      if (tx) throw new Error("Periode akuntansi sudah ditutup sampai 30/09/2026.")
    })
    const res = await updateChequeStatus(1, "cleared")
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("sudah ditutup")
    expect(mocks.chequeUpdateMany).not.toHaveBeenCalled()
    expect(mocks.assertPeriodOpen.mock.calls.some((c: unknown[]) => c[1] !== undefined)).toBe(true)
  })

  it("deleteCheque ditolak bila periode tertutup saat dinilai ulang dalam tx", async () => {
    mocks.assertPeriodOpen.mockImplementation(async (_d: unknown, tx?: unknown) => {
      if (tx) throw new Error("Periode akuntansi sudah ditutup sampai 30/09/2026.")
    })
    const res = await deleteCheque(1)
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("sudah ditutup")
    expect(mocks.chequeUpdateMany).not.toHaveBeenCalled()
  })
})

describe("deleteCheque tetap soft-delete", () => {
  it("menghapus pending lewat deletedAt", async () => {
    const res = await deleteCheque(1)
    expect(res.success).toBe(true)
    expect(mocks.chequeUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    })
    expect(mocks.chequeUpdate).not.toHaveBeenCalled()
  })

  it("soft-delete memakai klaim kondisional deletedAt null; klaim kalah ditolak", async () => {
    mocks.chequeUpdateMany.mockResolvedValue({ count: 0 })
    const res = await deleteCheque(1)
    expect(res.success).toBe(false)
    expect(String((res as { error: string }).error)).toContain("sudah terhapus")
    expect(mocks.chequeUpdate).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })
})
