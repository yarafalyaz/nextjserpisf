import { describe, it, expect, vi, beforeEach } from "vitest"
import { updateWorkOrder } from "../inventory.actions"

const m = await vi.hoisted(async () => (await import("./work-order-test-utils")).createWorkOrderMocks())
const requirePermissionMock = m.requirePermissionMock
const revalidateMock = m.revalidateMock
const logActivityMock = m.logActivityMock
const woFindUniqueOrThrowMock = m.woFindUniqueOrThrow
const transactionMock = m.transactionMock

vi.mock("@/lib/auth/permissions", () => m.mockAuth())
vi.mock("@/lib/db/prisma", () => m.mockPrisma())
vi.mock("@/lib/services/activity-log.service", () => m.mockActivity())
vi.mock("next/cache", () => m.mockCache())
vi.mock("@/lib/services/period-lock.service", () => m.mockPeriod())

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue({ id: 5 })
  woFindUniqueOrThrowMock.mockReset()
  transactionMock.mockReset().mockResolvedValue({})
  logActivityMock.mockReset()
  revalidateMock.mockReset()
})

describe("updateWorkOrder status guard", () => {
  it("rejects update if status is completed", async () => {
    woFindUniqueOrThrowMock.mockResolvedValue({ id: 10, status: "completed" })
    
    const formData = new FormData()
    formData.set("customerId", "1")
    formData.set("date", "2024-01-01")
    formData.set("items", JSON.stringify([{ itemId: 1, qty: 10, cost: 100 }]))

    const result = await updateWorkOrder(10, formData)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Hanya status 'draft' atau 'pending' yang dapat diperbarui/i)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("proceeds with update if status is draft", async () => {
    woFindUniqueOrThrowMock.mockResolvedValue({ id: 10, status: "draft" })
    
    const formData = new FormData()
    formData.set("customerId", "1")
    formData.set("date", "2024-01-01")
    formData.set("items", JSON.stringify([{ itemId: 1, qty: 10, cost: 100 }]))

    const result = await updateWorkOrder(10, formData)

    expect(result.success).toBe(true)
    expect(transactionMock).toHaveBeenCalledTimes(1)
  })
})
