import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Regression tests for the activity-log purge integrity contract.
 *
 * The bug: `clearActivityLog()` did a global `deleteMany()`, then logged a
 * single "someone deleted N logs" row. An actor with `manage_settings` could
 * therefore erase every trace of their own activity — the audit trail deleted
 * itself. The fix records the purge FIRST (action "purge") and then deletes
 * everything EXCEPT "purge" rows, so the who/when/how-many is permanent.
 *
 * Putaran 77: the purge evidence goes through `logActivity()`, whose
 * catch-all swallows insert failures — a failed insert still ran the delete.
 * Count, evidence insert, and delete now share ONE transaction, so a failed
 * insert aborts the whole purge.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => mocks.revalidatePath(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    activityLog: {
      count: (...a: unknown[]) => mocks.count(...a),
      create: (...a: unknown[]) => mocks.create(...a),
      deleteMany: (...a: unknown[]) => mocks.deleteMany(...a),
    },
    $transaction: (...a: unknown[]) => mocks.transaction(...a),
  },
}))

import { clearActivityLog } from "@/actions/activity-log.actions"

describe("clearActivityLog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.count.mockResolvedValue(500)
    mocks.create.mockResolvedValue({ id: 9 })
    mocks.deleteMany.mockResolvedValue({ count: 500 })
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const { prisma } = await import("@/lib/db/prisma")
      return fn(prisma)
    })
  })

  it("requires manage_settings", async () => {
    await clearActivityLog()
    expect(mocks.requirePermission).toHaveBeenCalledWith("manage_settings")
  })

  it("records the purge BEFORE deleting so the evidence survives", async () => {
    await clearActivityLog()
    // The order matters: the audit row must exist before the delete runs.
    const logOrder = mocks.create.mock.invocationCallOrder[0]
    const deleteOrder = mocks.deleteMany.mock.invocationCallOrder[0]
    expect(logOrder).toBeLessThan(deleteOrder)
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        userId: 1,
        action: "purge",
        modelType: "ActivityLog",
        modelId: 0,
        description: expect.stringContaining("500"),
      },
    })
  })

  it("deletes every log EXCEPT append-only purge records", async () => {
    await clearActivityLog()
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { action: { not: "purge" } },
    })
  })

  it("returns the deleted count and revalidates the log page", async () => {
    const res = await clearActivityLog()
    expect(res).toEqual({ deleted: 500 })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pengaturan/log-aktivitas")
  })

  it("putaran 77: insert bukti purge gagal menolak seluruh purge (delete tak dipanggil)", async () => {
    mocks.create.mockRejectedValue(new Error("tulis purge gagal"))
    await expect(clearActivityLog()).rejects.toThrow("tulis purge gagal")
    expect(mocks.deleteMany).not.toHaveBeenCalled()
  })

  it("putaran 77: count, insert, dan delete berada dalam satu transaksi", async () => {
    await clearActivityLog()
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.count.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.transaction.mock.invocationCallOrder[0])
    expect(mocks.create.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.transaction.mock.invocationCallOrder[0])
  })
})
