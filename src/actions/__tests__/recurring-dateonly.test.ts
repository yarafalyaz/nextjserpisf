import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Jadwal berulang wajib memakai tanggal kalender yang benar-benar ada.
 * `recurringTransactionSchema` dulu memakai `z.string()` polos dan aksinya
 * `new Date("2026-02-30")`, sehingga tanggal fiktif bergeser diam-diam ke
 * 2 Maret dan jadwal jatuh pada hari yang salah.
 */

const mocks = vi.hoisted(() => {
  const requirePermission = vi.fn()
  const logActivity = vi.fn()
  const revalidatePath = vi.fn()
  const generateDocumentNumber = vi.fn()
  const nextSlug = vi.fn()
  const scheduleCreate = vi.fn()
  const scheduleFindUniqueOrThrow = vi.fn()
  const scheduleUpdate = vi.fn()

  const prisma: Record<string, unknown> = {
    recurringTransaction: {
      create: scheduleCreate,
      findUniqueOrThrow: scheduleFindUniqueOrThrow,
      update: scheduleUpdate,
    },
  }

  return {
    requirePermission,
    logActivity,
    revalidatePath,
    generateDocumentNumber,
    nextSlug,
    scheduleCreate,
    scheduleFindUniqueOrThrow,
    scheduleUpdate,
    prisma,
  }
})

vi.mock("@/lib/db/prisma", async () => (await import("./validation-mock-helpers")).prismaFactory(mocks))
vi.mock("@/lib/auth/permissions", async () => (await import("./validation-mock-helpers")).permissionFactory(mocks))
vi.mock("@/lib/services/activity-log.service", async () => (await import("./validation-mock-helpers")).activityLogFactory(mocks))
vi.mock("next/cache", async () => (await import("./validation-mock-helpers")).revalidateFactory(mocks))
vi.mock("@/lib/utils/document-number", async () => (await import("./validation-mock-helpers")).docNumberFactory(mocks))
vi.mock("@/lib/utils/slug-db", async () => (await import("./validation-mock-helpers")).slugMockFactory(mocks))

import { createRecurringTransaction, updateRecurringTransaction } from "../recurring.actions"

function form(values: Record<string, string>): FormData {
  const fd = new FormData()
  fd.set("name", "Sewa gudang")
  fd.set("type", "journal")
  fd.set("frequency", "monthly")
  fd.set("interval", "1")
  fd.set("startDate", "2026-03-01")
  fd.set("amount", "900000")
  fd.set("debitAccountId", "610")
  fd.set("creditAccountId", "110")
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 1 })
  mocks.nextSlug.mockResolvedValue("sewa-gudang")
  mocks.scheduleCreate.mockResolvedValue({ id: 7, name: "Sewa gudang" })
  mocks.scheduleFindUniqueOrThrow.mockResolvedValue({
    id: 7,
    deletedAt: null,
    startDate: new Date(Date.UTC(2026, 2, 1)),
    nextRunDate: new Date(Date.UTC(2026, 2, 1)),
  })
  mocks.scheduleUpdate.mockResolvedValue({})
})

describe("createRecurringTransaction — tanggal kalender", () => {
  it("menolak startDate fiktif 2026-02-30 sebelum menulis DB", async () => {
    const res = await createRecurringTransaction(form({ startDate: "2026-02-30" }))

    expect(res.success).toBe(false)
    expect(mocks.scheduleCreate).not.toHaveBeenCalled()
  })

  it("menolak endDate fiktif sebelum menulis DB", async () => {
    const res = await createRecurringTransaction(form({ endDate: "2026-02-30" }))

    expect(res.success).toBe(false)
    expect(mocks.scheduleCreate).not.toHaveBeenCalled()
  })

  it("menyimpan tanggal sah sebagai tengah malam UTC", async () => {
    const res = await createRecurringTransaction(form({ startDate: "2026-03-15", endDate: "2027-03-15" }))

    expect(res.success).toBe(true)
    expect(mocks.scheduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startDate: new Date(Date.UTC(2026, 2, 15)),
          endDate: new Date(Date.UTC(2027, 2, 15)),
          nextRunDate: new Date(Date.UTC(2026, 2, 15)),
        }),
      }),
    )
  })

  it("update menolak startDate fiktif sebelum menulis DB", async () => {
    const res = await updateRecurringTransaction(7, form({ startDate: "bukan-tanggal" }))

    expect(res.success).toBe(false)
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled()
  })
})
