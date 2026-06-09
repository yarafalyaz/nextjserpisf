import { describe, it, expect, vi, beforeEach } from "vitest"

const createMock = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    activityLog: {
      create: (...a: unknown[]) => createMock(...a),
    },
  },
}))

vi.mock("@prisma/client", () => ({
  Prisma: { JsonNull: Symbol.for("Prisma.JsonNull") },
}))

import { logActivity } from "../activity-logger"
import { Prisma } from "@prisma/client"

beforeEach(() => {
  createMock.mockReset()
  createMock.mockResolvedValue({ id: 1 })
})

describe("logActivity", () => {
  it("persists the core audit fields", async () => {
    await logActivity({ action: "create", modelType: "Customer", modelId: 5, userId: 3 })
    expect(createMock).toHaveBeenCalledOnce()
    const arg = createMock.mock.calls[0][0]
    expect(arg.data.action).toBe("create")
    expect(arg.data.modelType).toBe("Customer")
    expect(arg.data.modelId).toBe(5)
    expect(arg.data.userId).toBe(3)
  })

  it("stringifies oldValues/newValues when provided", async () => {
    await logActivity({
      action: "update",
      modelType: "Item",
      oldValues: { name: "old" },
      newValues: { name: "new" },
    })
    const arg = createMock.mock.calls[0][0]
    expect(arg.data.oldValues).toBe(JSON.stringify({ name: "old" }))
    expect(arg.data.newValues).toBe(JSON.stringify({ name: "new" }))
  })

  it("uses Prisma.JsonNull when values are omitted", async () => {
    await logActivity({ action: "delete", modelType: "Item" })
    const arg = createMock.mock.calls[0][0]
    expect(arg.data.oldValues).toBe(Prisma.JsonNull)
    expect(arg.data.newValues).toBe(Prisma.JsonNull)
  })

  it("swallows DB errors so logging never breaks the caller", async () => {
    createMock.mockRejectedValue(new Error("db down"))
    await expect(
      logActivity({ action: "create", modelType: "Item" }),
    ).resolves.toBeUndefined()
  })
})
