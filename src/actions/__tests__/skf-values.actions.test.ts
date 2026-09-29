import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    skfValue: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  }
  return {
    tx,
    requirePermission: vi.fn().mockResolvedValue({ id: 1 }),
    revalidatePath: vi.fn(),
    logActivity: vi.fn().mockResolvedValue(undefined),
    prisma: {
      skfValue: {
        findMany: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivity }))

import { deleteSkfValue, upsertBulkSkfValues } from "@/actions/skf-values.actions"

describe("SKF value actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 1 })
    mocks.tx.$queryRaw.mockResolvedValue([{ id: 1 }])
    mocks.tx.skfValue.findFirst.mockResolvedValue(null)
    mocks.tx.skfValue.update.mockResolvedValue({})
    mocks.tx.skfValue.create.mockResolvedValue({})
    mocks.tx.skfValue.delete.mockResolvedValue({})
    mocks.prisma.skfValue.delete.mockResolvedValue({})
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx))
  })

  it("updates an existing company-wide value with a NULL cost center", async () => {
    mocks.tx.skfValue.findFirst.mockResolvedValueOnce({ id: 42 })

    const result = await upsertBulkSkfValues(1, "2026-09", [
      { costCenterId: null, value: 120 },
    ])

    expect(result.success).toBe(true)
    expect(mocks.tx.skfValue.findFirst).toHaveBeenCalledWith({
      where: {
        statisticalKeyFigureId: 1,
        period: "2026-09",
        costCenterId: null,
        profitCenterId: null,
      },
      select: { id: true },
    })
    expect(mocks.tx.skfValue.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { value: 120 },
    })
    expect(mocks.tx.skfValue.create).not.toHaveBeenCalled()
  })

  it("rejects invalid calendar months", async () => {
    const result = await upsertBulkSkfValues(1, "2026-13", [])

    expect(result.success).toBe(false)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it("deletes SKF values with the SKF delete permission", async () => {
    const result = await deleteSkfValue(42)

    expect(result.success).toBe(true)
    expect(mocks.requirePermission).toHaveBeenCalledWith("delete_statistical_key_figures")
  })
})
