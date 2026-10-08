import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for the non-material production cost rollup (PRD FAB-06/07/08/09).
// The HPP of a production order = material (applied by issueMaterial) + the
// non-material cost lines. This module must apply only the DELTA so the material
// portion is never lost or double-counted, and must never drive the total below
// zero.

const orderFindUniqueMock = vi.fn()
const orderUpdateMock = vi.fn()
const executeRawMock = vi.fn()
const costFindUniqueMock = vi.fn()
const costCreateMock = vi.fn()
const costUpdateMock = vi.fn()
const costDeleteMock = vi.fn()

const client = {
  $queryRaw: (...a: unknown[]) => executeRawMock(...a),
  productionOrder: {
    findUnique: (...a: unknown[]) => orderFindUniqueMock(...a),
    update: (...a: unknown[]) => orderUpdateMock(...a),
  },
  productionCost: {
    findUnique: (...a: unknown[]) => costFindUniqueMock(...a),
    create: (...a: unknown[]) => costCreateMock(...a),
    update: (...a: unknown[]) => costUpdateMock(...a),
    delete: (...a: unknown[]) => costDeleteMock(...a),
  },
}

import {
  applyProductionCostDelta,
  syncReworkCostToOrder,
} from "@/lib/services/production-cost.service"

beforeEach(() => {
  orderFindUniqueMock.mockReset()
  orderUpdateMock.mockReset()
  executeRawMock.mockReset()
  costFindUniqueMock.mockReset()
  costCreateMock.mockReset()
  costUpdateMock.mockReset()
  costDeleteMock.mockReset()
})

describe("applyProductionCostDelta", () => {
  it("adds the delta to the existing actual cost (material preserved)", async () => {
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 1000 })
    orderUpdateMock.mockResolvedValue({})

    await applyProductionCostDelta(1, 250, client as never)

    expect(orderUpdateMock).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { totalActualCost: 1250 },
    })
  })

  it("subtracts on a negative delta (cost line removed)", async () => {
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 1000 })
    orderUpdateMock.mockResolvedValue({})

    await applyProductionCostDelta(1, -400, client as never)

    expect(orderUpdateMock).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { totalActualCost: 600 },
    })
  })

  it("never lets the total go below zero", async () => {
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 100 })
    orderUpdateMock.mockResolvedValue({})

    await applyProductionCostDelta(1, -400, client as never)

    expect(orderUpdateMock).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { totalActualCost: 0 },
    })
  })

  it("is a no-op for a zero delta (no lock, no write)", async () => {
    await applyProductionCostDelta(1, 0, client as never)

    expect(executeRawMock).not.toHaveBeenCalled()
    expect(orderUpdateMock).not.toHaveBeenCalled()
  })

  it("locks the order row before the read-modify-write", async () => {
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 0 })
    orderUpdateMock.mockResolvedValue({})

    await applyProductionCostDelta(1, 50, client as never)

    // The FOR UPDATE lock must happen before the read (serialises with issueMaterial).
    expect(executeRawMock).toHaveBeenCalledTimes(1)
    expect(executeRawMock.mock.invocationCallOrder[0]).toBeLessThan(
      orderFindUniqueMock.mock.invocationCallOrder[0],
    )
  })

  it("does nothing when the order no longer exists", async () => {
    orderFindUniqueMock.mockResolvedValue(null)

    await applyProductionCostDelta(1, 50, client as never)

    expect(orderUpdateMock).not.toHaveBeenCalled()
  })
})

describe("syncReworkCostToOrder", () => {
  const base = {
    nonconformance: { id: 7, referenceType: "ProductionOrder", referenceId: 55 },
    reworkCost: 150000,
    reworkHours: 3,
    documentNo: "NCR-0007",
    createdBy: 5,
  }

  it("ignores non-production references (no HPP to roll into)", async () => {
    const res = await syncReworkCostToOrder(
      { ...base, nonconformance: { id: 7, referenceType: "WorkOrder", referenceId: 9 } },
      client as never,
    )

    expect(res).toEqual({ posted: 0, productionOrderId: null })
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(costUpdateMock).not.toHaveBeenCalled()
    expect(orderUpdateMock).not.toHaveBeenCalled()
  })

  it("creates a rework line and rolls the full amount into HPP", async () => {
    costFindUniqueMock.mockResolvedValue(null)
    costCreateMock.mockResolvedValue({ id: 1 })
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 1000 })
    orderUpdateMock.mockResolvedValue({})

    const res = await syncReworkCostToOrder(base, client as never)

    expect(res).toEqual({ posted: 150000, productionOrderId: 55 })
    const created = costCreateMock.mock.calls[0][0]
    expect(created.data.category).toBe("rework")
    expect(created.data.nonconformanceId).toBe(7)
    expect(Number(created.data.amount)).toBe(150000)
    // HPP 1000 + 150000
    expect(orderUpdateMock).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { totalActualCost: 151000 },
    })
  })

  it("applies only the delta when the rework cost changes", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 1, amount: 100000 })
    costUpdateMock.mockResolvedValue({})
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 100000 })
    orderUpdateMock.mockResolvedValue({})

    await syncReworkCostToOrder(base, client as never)

    // 150000 - 100000 = +50000
    expect(orderUpdateMock).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { totalActualCost: 150000 },
    })
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("removes the line and subtracts when the rework cost is cleared", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 1, amount: 100000 })
    costDeleteMock.mockResolvedValue({})
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 100000 })
    orderUpdateMock.mockResolvedValue({})

    const res = await syncReworkCostToOrder({ ...base, reworkCost: 0 }, client as never)

    expect(res).toEqual({ posted: 0, productionOrderId: 55 })
    expect(costDeleteMock).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(orderUpdateMock).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { totalActualCost: 0 },
    })
  })

  it("is a no-op when a cleared cost has no existing line", async () => {
    costFindUniqueMock.mockResolvedValue(null)

    const res = await syncReworkCostToOrder({ ...base, reworkCost: 0 }, client as never)

    expect(res).toEqual({ posted: 0, productionOrderId: 55 })
    expect(costDeleteMock).not.toHaveBeenCalled()
    expect(orderUpdateMock).not.toHaveBeenCalled()
  })
})
