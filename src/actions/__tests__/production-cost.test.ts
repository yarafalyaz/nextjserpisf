import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression tests for non-material production cost actions (PRD FAB-06/07/08/09):
//  1. createProductionCost rolls the amount into the production order HPP, but
//     only for production orders (not work orders), and refuses a completed order.
//  2. updateProductionCost applies only the delta.
//  3. deleteProductionCost subtracts the amount.
//  4. pullLaborCostFromTimesheets snapshots hours×rate, skips already-pulled
//     timesheets, and needs a linked project.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const applyDeltaMock = vi.fn()

const costCreateMock = vi.fn()
const costFindUniqueMock = vi.fn()
const costUpdateMock = vi.fn()
const costDeleteMock = vi.fn()
const costFindManyMock = vi.fn()
const orderFindUniqueMock = vi.fn()
const woFindUniqueMock = vi.fn()
const vendorFindUniqueMock = vi.fn()
const timesheetFindManyMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/production-cost.service", () => ({
  applyProductionCostDelta: (...a: unknown[]) => applyDeltaMock(...a),
}))

vi.mock("@/lib/db/prisma", () => {
  const prisma: Record<string, unknown> = {
    productionCost: {
      create: (...a: unknown[]) => costCreateMock(...a),
      findUnique: (...a: unknown[]) => costFindUniqueMock(...a),
      update: (...a: unknown[]) => costUpdateMock(...a),
      delete: (...a: unknown[]) => costDeleteMock(...a),
      findMany: (...a: unknown[]) => costFindManyMock(...a),
    },
    productionOrder: { findUnique: (...a: unknown[]) => orderFindUniqueMock(...a) },
    workOrder: { findUnique: (...a: unknown[]) => woFindUniqueMock(...a) },
    vendor: { findUnique: (...a: unknown[]) => vendorFindUniqueMock(...a) },
    timesheet: { findMany: (...a: unknown[]) => timesheetFindManyMock(...a) },
  }
  prisma.$transaction = vi.fn((cb: unknown) =>
    typeof cb === "function" ? (cb as (tx: unknown) => unknown)(prisma) : Promise.all(cb as unknown[]),
  )
  return { prisma }
})

import {
  createProductionCost,
  updateProductionCost,
  deleteProductionCost,
  pullLaborCostFromTimesheets,
  applyOverheadToProductionOrder,
} from "../production-cost.actions"

function fd(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) if (v != null) f.append(k, String(v))
  return f
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, applyDeltaMock,
    costCreateMock, costFindUniqueMock, costUpdateMock, costDeleteMock, costFindManyMock,
    orderFindUniqueMock, woFindUniqueMock, vendorFindUniqueMock, timesheetFindManyMock,
  ]) m.mockReset()

  requirePermissionMock.mockResolvedValue({ id: 5 })
  applyDeltaMock.mockResolvedValue(undefined)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("createProductionCost", () => {
  it("rolls the amount into the production order HPP", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress" })
    costCreateMock.mockResolvedValue({ id: 99 })

    const res = await createProductionCost(
      fd({ productionOrderId: 1, category: "labor", amount: 250000, hours: 10, rate: 25000 }),
    )

    expect(res.success).toBe(true)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 250000, expect.anything(), expect.objectContaining({ costLineId: expect.anything() }))
    const arg = costCreateMock.mock.calls[0][0]
    expect(arg.data.category).toBe("labor")
    expect(Number(arg.data.amount)).toBe(250000)
  })

  it("does NOT roll a work-order-only cost into a production order HPP", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7 })
    costCreateMock.mockResolvedValue({ id: 100 })

    const res = await createProductionCost(fd({ workOrderId: 7, category: "service", amount: 50000 }))

    expect(res.success).toBe(true)
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("refuses to add cost to a completed production order", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "completed" })

    const res = await createProductionCost(fd({ productionOrderId: 1, category: "labor", amount: 1000 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("completed")
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("refuses when neither order nor work order is given", async () => {
    const res = await createProductionCost(fd({ category: "labor", amount: 1000 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("perintah")
    expect(costCreateMock).not.toHaveBeenCalled()
  })
})

describe("updateProductionCost", () => {
  it("applies only the delta to the order", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 5, productionOrderId: 1, amount: 100 })
    costUpdateMock.mockResolvedValue({})

    const res = await updateProductionCost(5, fd({ category: "labor", amount: 300 }))

    expect(res.success).toBe(true)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 200, expect.anything(), expect.anything())
  })
})

describe("deleteProductionCost", () => {
  it("subtracts the amount from the order", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 5, productionOrderId: 1, amount: 400 })
    costDeleteMock.mockResolvedValue({})

    const res = await deleteProductionCost(5)

    expect(res.success).toBe(true)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, -400, expect.anything(), expect.anything())
  })
})

describe("pullLaborCostFromTimesheets", () => {
  it("creates one labor line per un-pulled timesheet and rolls the total", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, projectId: 3 })
    orderFindUniqueMock.mockResolvedValue({ id: 1 })
    timesheetFindManyMock.mockResolvedValue([
      { id: 11, hours: 4, date: new Date(), description: null },
      { id: 12, hours: 6, date: new Date(), description: "welding" },
    ])
    costFindManyMock.mockResolvedValue([])
    costCreateMock.mockResolvedValue({ id: 1 })

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(true)
    expect(res.count).toBe(2)
    // 4*25000 + 6*25000 = 250000
    expect(res.added).toBe(250000)
    expect(costCreateMock).toHaveBeenCalledTimes(2)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 250000, expect.anything(), expect.anything())
    const first = costCreateMock.mock.calls[0][0]
    expect(first.data.sourceTimesheetId).toBe(11)
    expect(Number(first.data.rate)).toBe(25000)
  })

  it("skips timesheets already mapped to an existing cost line", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, projectId: 3 })
    orderFindUniqueMock.mockResolvedValue({ id: 1 })
    timesheetFindManyMock.mockResolvedValue([
      { id: 11, hours: 4, date: new Date(), description: null },
      { id: 12, hours: 6, date: new Date(), description: null },
    ])
    costFindManyMock.mockResolvedValue([{ sourceTimesheetId: 11 }])
    costCreateMock.mockResolvedValue({ id: 1 })

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(true)
    expect(res.count).toBe(1)
    expect(costCreateMock).toHaveBeenCalledTimes(1)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 150000, expect.anything(), expect.anything())
  })

  it("fails when the work order has no linked project", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, projectId: null })

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(false)
    expect(res.error).toContain("proyek")
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("fails on an invalid rate", async () => {
    const res = await pullLaborCostFromTimesheets(7, 1, -1)

    expect(res.success).toBe(false)
    expect(res.error).toContain("Tarif")
    expect(timesheetFindManyMock).not.toHaveBeenCalled()
  })
})

describe("applyOverheadToProductionOrder (PRD FAB-07)", () => {
  it("applies driver × rate as an overhead applied line and rolls it into HPP", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress", documentNo: "MO-001" })
    costCreateMock.mockResolvedValue({ id: 77 })

    const res = await applyOverheadToProductionOrder(
      fd({ productionOrderId: 1, driverType: "machine_hours", driverQty: 12, rate: 50000 }),
    )

    expect(res.success).toBe(true)
    expect((res as { amount?: number }).amount).toBe(600000)
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productionOrderId: 1,
          category: "overhead",
          driverType: "machine_hours",
          isAppliedOverhead: true,
          hours: 12,
          rate: 50000,
          amount: 600000,
        }),
      }),
    )
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 600000, expect.anything(), expect.anything())
  })

  it("rejects a non-positive applied amount", async () => {
    const res = await applyOverheadToProductionOrder(
      fd({ productionOrderId: 1, driverType: "labor_hours", driverQty: 0, rate: 50000 }),
    )
    expect(res.success).toBe(false)
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("refuses to apply overhead to a completed order", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "completed" })

    const res = await applyOverheadToProductionOrder(
      fd({ productionOrderId: 1, driverType: "quantity", driverQty: 5, rate: 1000 }),
    )

    expect(res.success).toBe(false)
    expect(res.error).toContain("completed")
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("rejects an invalid driver type", async () => {
    const res = await applyOverheadToProductionOrder(
      fd({ productionOrderId: 1, driverType: "bogus", driverQty: 5, rate: 1000 }),
    )
    expect(res.success).toBe(false)
    expect(orderFindUniqueMock).not.toHaveBeenCalled()
  })
})
