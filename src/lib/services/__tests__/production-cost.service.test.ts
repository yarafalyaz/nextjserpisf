import { describe, it, expect, vi, beforeEach } from "vitest"

// The delta rollup now also posts the non-material cost as Dr WIP / Cr absorption.
// Stub that journal service so these unit tests exercise only the rollup maths.
const absorbedMock = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: {
    onProductionCostAbsorbed: (...a: unknown[]) => absorbedMock(...a),
  },
}))

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
const orderFindManyMock = vi.fn()
const costFindManyMock = vi.fn()
const poFindUniqueMock = vi.fn()
const woFindUniqueMock = vi.fn()

const client = {
  $queryRaw: (...a: unknown[]) => executeRawMock(...a),
  productionOrder: {
    findUnique: (...a: unknown[]) => orderFindUniqueMock(...a),
    findMany: (...a: unknown[]) => orderFindManyMock(...a),
    update: (...a: unknown[]) => orderUpdateMock(...a),
  },
  workOrder: {
    findUnique: (...a: unknown[]) => woFindUniqueMock(...a),
  },
  productionCost: {
    findUnique: (...a: unknown[]) => costFindUniqueMock(...a),
    findMany: (...a: unknown[]) => costFindManyMock(...a),
    create: (...a: unknown[]) => costCreateMock(...a),
    update: (...a: unknown[]) => costUpdateMock(...a),
    delete: (...a: unknown[]) => costDeleteMock(...a),
  },
  purchaseOrder: {
    findUnique: (...a: unknown[]) => poFindUniqueMock(...a),
  },
}

import {
  applyProductionCostDelta,
  syncReworkCostToOrder,
  syncServicePurchaseOrderCost,
} from "@/lib/services/production-cost.service"

beforeEach(() => {
  orderFindUniqueMock.mockReset()
  orderUpdateMock.mockReset()
  executeRawMock.mockReset()
  costFindUniqueMock.mockReset()
  costCreateMock.mockReset()
  costUpdateMock.mockReset()
  costDeleteMock.mockReset()
  orderFindManyMock.mockReset()
  costFindManyMock.mockReset()
  poFindUniqueMock.mockReset()
  woFindUniqueMock.mockReset()
  woFindUniqueMock.mockResolvedValue({ status: "in_progress" })
  absorbedMock.mockClear()
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
    orderFindUniqueMock.mockResolvedValue({ status: "in_progress", workOrderId: null, totalActualCost: 0 })

    const res = await syncReworkCostToOrder({ ...base, reworkCost: 0 }, client as never)

    expect(res).toEqual({ posted: 0, productionOrderId: 55 })
    expect(costDeleteMock).not.toHaveBeenCalled()
    expect(orderUpdateMock).not.toHaveBeenCalled()
  })

  it("F-009-V: PO closed ditolak (guard terpusat melempar)", async () => {
    orderFindUniqueMock.mockResolvedValue({ status: "closed", workOrderId: null })

    await expect(syncReworkCostToOrder(base, client as never)).rejects.toThrow(/sudah ditutup \(closed\)/)
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(costUpdateMock).not.toHaveBeenCalled()
    expect(orderUpdateMock).not.toHaveBeenCalled()
  })

  it("F-009-V: WO induk closed ditolak walau PO masih completed", async () => {
    orderFindUniqueMock.mockResolvedValue({ status: "completed", workOrderId: 9 })
    woFindUniqueMock.mockResolvedValue({ status: "closed" })

    await expect(syncReworkCostToOrder(base, client as never)).rejects.toThrow(/perintah kerja sudah ditutup/)
    expect(costCreateMock).not.toHaveBeenCalled()
  })
})

describe("syncServicePurchaseOrderCost", () => {
  const input = {
    purchaseOrderId: 42,
    amount: 500000,
    documentNo: "PO-0042",
    createdBy: 5,
  }

  it("is a no-op for a non-service PO", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: false, workOrderId: 9, vendorId: 3 })

    const res = await syncServicePurchaseOrderCost(input, client as never)

    expect(res).toEqual({ posted: 0, productionOrderIds: [], skippedProductionOrderIds: [] })
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(orderUpdateMock).not.toHaveBeenCalled()
  })

  it("is a no-op when the PO has no work order", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: null, vendorId: 3 })

    const res = await syncServicePurchaseOrderCost(input, client as never)

    expect(res).toEqual({ posted: 0, productionOrderIds: [], skippedProductionOrderIds: [] })
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("is a no-op when the work order has no production order", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    orderFindManyMock.mockResolvedValue([])

    const res = await syncServicePurchaseOrderCost(input, client as never)

    expect(res).toEqual({ posted: 0, productionOrderIds: [], skippedProductionOrderIds: [] })
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("creates a subcontract line on the WO's production order and rolls it into HPP", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    orderFindManyMock.mockResolvedValue([{ id: 55 }])
    costFindManyMock.mockResolvedValue([])
    costCreateMock.mockResolvedValue({ id: 1 })
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 1000 })
    orderUpdateMock.mockResolvedValue({})

    const res = await syncServicePurchaseOrderCost(input, client as never)

    expect(res).toEqual({ posted: 500000, productionOrderIds: [55], skippedProductionOrderIds: [] })
    const created = costCreateMock.mock.calls[0][0]
    expect(created.data.category).toBe("subcontract")
    expect(created.data.purchaseOrderId).toBe(42)
    expect(created.data.workOrderId).toBe(9)
    expect(created.data.productionOrderId).toBe(55)
    expect(Number(created.data.amount)).toBe(500000)
    // HPP 1000 + 500000
    expect(orderUpdateMock).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { totalActualCost: 501000 },
    })
  })

  it("applies only the delta to HPP when the PO value changes", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    orderFindManyMock.mockResolvedValue([{ id: 55 }])
    costFindManyMock.mockResolvedValue([{ id: 1, amount: 300000, productionOrderId: 55 }])
    costUpdateMock.mockResolvedValue({})
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 300000 })
    orderUpdateMock.mockResolvedValue({})

    await syncServicePurchaseOrderCost(input, client as never)

    // 500000 - 300000 = +200000
    const updated = costUpdateMock.mock.calls[0][0]
    expect(updated.data.amount).toBe(500000)
    expect(orderUpdateMock).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { totalActualCost: 500000 },
    })
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("removes the line and subtracts from HPP when the PO value is cleared", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    orderFindManyMock.mockResolvedValue([{ id: 55 }])
    costFindManyMock.mockResolvedValue([{ id: 1, amount: 300000, productionOrderId: 55 }])
    costDeleteMock.mockResolvedValue({})
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 300000 })
    orderUpdateMock.mockResolvedValue({})

    const res = await syncServicePurchaseOrderCost({ ...input, amount: 0 }, client as never)

    expect(res).toEqual({ posted: 0, productionOrderIds: [55], skippedProductionOrderIds: [] })
    expect(costDeleteMock).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(orderUpdateMock).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { totalActualCost: 0 },
    })
  })

  it("splits the PO value across multiple production orders with the remainder on the first", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    orderFindManyMock.mockResolvedValue([{ id: 55 }, { id: 56 }])
    costFindManyMock.mockResolvedValue([])
    costCreateMock.mockResolvedValue({ id: 1 })
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 0 })
    orderUpdateMock.mockResolvedValue({})

    await syncServicePurchaseOrderCost({ ...input, amount: 100 }, client as never)

    const amounts = costCreateMock.mock.calls.map((c) => Number(c[0].data.amount))
    // 100 / 2 = 50 each, no remainder.
    expect(amounts).toEqual([50, 50])
    // HPP sum equals the PO value exactly.
    const hpp = orderUpdateMock.mock.calls.reduce((s, c) => s + c[0].data.totalActualCost, 0)
    expect(hpp).toBe(100)
  })

  it("creates no line when the desired amount is zero and nothing exists", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    orderFindManyMock.mockResolvedValue([{ id: 55 }])
    costFindManyMock.mockResolvedValue([])

    const res = await syncServicePurchaseOrderCost({ ...input, amount: 0 }, client as never)

    expect(res).toEqual({ posted: 0, productionOrderIds: [55], skippedProductionOrderIds: [] })
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(costDeleteMock).not.toHaveBeenCalled()
    expect(orderUpdateMock).not.toHaveBeenCalled()
  })

  it("F-71: skips a completed production order entirely (no line, no HPP, no journal)", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    orderFindManyMock.mockResolvedValue([{ id: 55, status: "completed" }])
    costFindManyMock.mockResolvedValue([])

    const res = await syncServicePurchaseOrderCost(input, client as never)

    expect(res).toEqual({ posted: 0, productionOrderIds: [], skippedProductionOrderIds: [55] })
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(costUpdateMock).not.toHaveBeenCalled()
    expect(costDeleteMock).not.toHaveBeenCalled()
    expect(orderUpdateMock).not.toHaveBeenCalled()
    expect(absorbedMock).not.toHaveBeenCalled()
  })

  it("F-71: spreads the PO value only across non-completed orders", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    orderFindManyMock.mockResolvedValue([
      { id: 55, status: "completed" },
      { id: 56, status: "in_progress" },
    ])
    costFindManyMock.mockResolvedValue([])
    costCreateMock.mockResolvedValue({ id: 1 })
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 0 })
    orderUpdateMock.mockResolvedValue({})

    const res = await syncServicePurchaseOrderCost({ ...input, amount: 100 }, client as never)

    expect(res.skippedProductionOrderIds).toEqual([55])
    expect(res.productionOrderIds).toEqual([56])
    // The full amount lands on the one active order — no equal split with the
    // completed order and nothing written to it.
    const created = costCreateMock.mock.calls.map((c) => c[0].data)
    expect(created).toHaveLength(1)
    expect(created[0].productionOrderId).toBe(56)
    expect(Number(created[0].amount)).toBe(100)
    expect(orderUpdateMock.mock.calls.every((c) => c[0].where.id === 56)).toBe(true)
  })

  it("F-71: leaves existing subcontract lines on a completed order untouched", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    orderFindManyMock.mockResolvedValue([
      { id: 55, status: "completed" },
      { id: 56, status: "in_progress" },
    ])
    costFindManyMock.mockResolvedValue([{ id: 1, amount: 300000, productionOrderId: 55 }])
    costCreateMock.mockResolvedValue({ id: 2 })
    orderFindUniqueMock.mockResolvedValue({ totalActualCost: 0 })
    orderUpdateMock.mockResolvedValue({})

    await syncServicePurchaseOrderCost({ ...input, amount: 100 }, client as never)

    // The completed order's existing line is historic — not updated, not
    // deleted, and its HPP is not re-opened by the delta.
    expect(costUpdateMock).not.toHaveBeenCalled()
    expect(costDeleteMock).not.toHaveBeenCalled()
    expect(orderUpdateMock.mock.calls.every((c) => c[0].where.id === 56)).toBe(true)
  })

  it("F-71: does not strip subcontract cost from a completed order when the billed total is cleared", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    orderFindManyMock.mockResolvedValue([{ id: 55, status: "completed" }])
    costFindManyMock.mockResolvedValue([{ id: 1, amount: 300000, productionOrderId: 55 }])

    const res = await syncServicePurchaseOrderCost({ ...input, amount: 0 }, client as never)

    expect(res).toEqual({ posted: 0, productionOrderIds: [], skippedProductionOrderIds: [55] })
    expect(costDeleteMock).not.toHaveBeenCalled()
    expect(orderUpdateMock).not.toHaveBeenCalled()
    expect(absorbedMock).not.toHaveBeenCalled()
  })

  it("F-009-V: PO closed dilewati seperti completed (skipped, tanpa tulis)", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    orderFindManyMock.mockResolvedValue([{ id: 55, status: "closed" }])
    costFindManyMock.mockResolvedValue([])

    const res = await syncServicePurchaseOrderCost(input, client as never)

    expect(res).toEqual({ posted: 0, productionOrderIds: [], skippedProductionOrderIds: [55] })
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(orderUpdateMock).not.toHaveBeenCalled()
    expect(absorbedMock).not.toHaveBeenCalled()
  })

  it("F-009-V: WO closed membekukan semua PO anak pada sync jasa", async () => {
    poFindUniqueMock.mockResolvedValue({ isService: true, workOrderId: 9, vendorId: 3 })
    woFindUniqueMock.mockResolvedValue({ status: "closed" })
    orderFindManyMock.mockResolvedValue([{ id: 55, status: "in_progress" }, { id: 56, status: "completed" }])

    const res = await syncServicePurchaseOrderCost(input, client as never)

    expect(res).toEqual({ posted: 0, productionOrderIds: [], skippedProductionOrderIds: [55, 56] })
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(orderUpdateMock).not.toHaveBeenCalled()
  })
})
