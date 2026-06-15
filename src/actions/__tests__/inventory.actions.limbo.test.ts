import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  completeMaterialIssue,
  processStockAdjustment,
  processInventoryTransfer,
  receiveInventoryTransfer,
} from "@/actions/inventory.actions"

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn().mockResolvedValue({ id: 1, permissions: [], roles: ["super_admin"] }),
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

// Hooks that throw mid-transaction.
vi.mock("@/lib/hooks/material-issue.hook", () => ({
  onMaterialIssueCompleted: vi.fn().mockRejectedValue(new Error("Simulated hook failure")),
}))
vi.mock("@/lib/hooks/stock-adjustment.hook", () => ({
  onStockAdjustmentProcessed: vi.fn().mockRejectedValue(new Error("Simulated hook failure")),
}))
vi.mock("@/lib/hooks/inventory-transfer.hook", () => ({
  onTransferProcessed: vi.fn().mockRejectedValue(new Error("Simulated hook failure")),
  onTransferReceived: vi.fn().mockRejectedValue(new Error("Simulated hook failure")),
}))

const updateManyMock = vi.fn()
const findUniqueOrThrowMock = vi.fn()

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: new Proxy({} as any, {
      get: (_t, prop: string) => {
        if (prop === "$transaction") {
          return async (cb: (tx: unknown) => unknown) => cb({})
        }
        if (prop === "materialIssue" || prop === "stockAdjustment" || prop === "inventoryTransfer") {
          return {
            findUniqueOrThrow: findUniqueOrThrowMock,
            updateMany: updateManyMock,
            update: vi.fn(),
          }
        }
        return undefined
      },
    }),
    TxClient: class {},
  }
})

const expectRestored = (calls: unknown[][], modelName: string, expectedStatus: string, originalStatus: string) => {
  const restoreCall = calls.find((args) => {
    const arg = args[0] as { where?: { id: number; status: string }; data?: { status: string } }
    return (
      arg?.where?.id === 1 &&
      arg?.where?.status === expectedStatus &&
      arg?.data?.status === originalStatus
    )
  })
  expect(restoreCall, `expected ${modelName} to be restored to "${originalStatus}" on transaction failure`).toBeDefined()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Inventory action claim rollback on transaction failure (limbo bug)", () => {
  it("completeMaterialIssue: failed transaction must roll claim back to draft", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ id: 1, status: "draft", items: [] })
    updateManyMock.mockResolvedValueOnce({ count: 1 }) // claim succeeds (draft -> processing)

    const res = await completeMaterialIssue(1)
    expect(res.success).toBe(false)
    expectRestored(updateManyMock.mock.calls, "materialIssue", "processing", "draft")
  })

  it("processStockAdjustment: failed transaction must roll claim back to draft", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ id: 1, status: "draft", items: [] })
    updateManyMock.mockResolvedValueOnce({ count: 1 }) // claim succeeds (draft -> processing)

    const res = await processStockAdjustment(1)
    expect(res.success).toBe(false)
    expectRestored(updateManyMock.mock.calls, "stockAdjustment", "processing", "draft")
  })

  it("processInventoryTransfer: failed transaction must roll claim back to draft", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ id: 1, status: "draft", items: [] })
    updateManyMock.mockResolvedValueOnce({ count: 1 }) // claim succeeds (draft -> processing)

    const res = await processInventoryTransfer(1)
    expect(res.success).toBe(false)
    expectRestored(updateManyMock.mock.calls, "inventoryTransfer (process)", "processing", "draft")
  })

  it("receiveInventoryTransfer: failed transaction must roll claim back to processed", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ id: 1, status: "processed", items: [] })
    updateManyMock.mockResolvedValueOnce({ count: 1 }) // claim succeeds (processed -> receiving)

    const res = await receiveInventoryTransfer(1)
    expect(res.success).toBe(false)
    expectRestored(updateManyMock.mock.calls, "inventoryTransfer (receive)", "receiving", "processed")
  })
})
