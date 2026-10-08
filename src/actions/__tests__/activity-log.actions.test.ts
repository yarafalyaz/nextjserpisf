import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Regression tests for the activity-log purge integrity contract.
 *
 * The bug: `clearActivityLog()` did a global `deleteMany()`, then logged a
 * single "someone deleted N logs" row. An actor with `manage_settings` could
 * therefore erase every trace of their own activity — the audit trail deleted
 * itself. The fix records the purge FIRST (action "purge") and then deletes
 * everything EXCEPT "purge" rows, so the who/when/how-many is permanent.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  count: vi.fn(),
  deleteMany: vi.fn(),
  logActivity: vi.fn(),
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
      deleteMany: (...a: unknown[]) => mocks.deleteMany(...a),
    },
  },
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivity(...a),
}))

import { clearActivityLog } from "@/actions/activity-log.actions"

describe("clearActivityLog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 1 })
    mocks.count.mockResolvedValue(500)
    mocks.deleteMany.mockResolvedValue({ count: 500 })
    mocks.logActivity.mockResolvedValue(undefined)
  })

  it("requires manage_settings", async () => {
    await clearActivityLog()
    expect(mocks.requirePermission).toHaveBeenCalledWith("manage_settings")
  })

  it("records the purge BEFORE deleting so the evidence survives", async () => {
    await clearActivityLog()
    // The order matters: the audit row must exist before the delete runs.
    const logOrder = mocks.logActivity.mock.invocationCallOrder[0]
    const deleteOrder = mocks.deleteMany.mock.invocationCallOrder[0]
    expect(logOrder).toBeLessThan(deleteOrder)
    expect(mocks.logActivity).toHaveBeenCalledWith(
      "purge",
      "ActivityLog",
      0,
      expect.stringContaining("500"),
    )
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
})
