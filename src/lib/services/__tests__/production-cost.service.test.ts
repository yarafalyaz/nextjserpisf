import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for the non-material production cost rollup (PRD FAB-06/07/08/09).
// The HPP of a production order = material (applied by issueMaterial) + the
// non-material cost lines. This module must apply only the DELTA so the material
// portion is never lost or double-counted, and must never drive the total below
// zero.

const orderFindUniqueMock = vi.fn()
const orderUpdateMock = vi.fn()
const executeRawMock = vi.fn()

const client = {
  $queryRaw: (...a: unknown[]) => executeRawMock(...a),
  productionOrder: {
    findUnique: (...a: unknown[]) => orderFindUniqueMock(...a),
    update: (...a: unknown[]) => orderUpdateMock(...a),
  },
}

import { applyProductionCostDelta } from "@/lib/services/production-cost.service"

beforeEach(() => {
  orderFindUniqueMock.mockReset()
  orderUpdateMock.mockReset()
  executeRawMock.mockReset()
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
