import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for production genealogy (PRD line 369 / REP-13): on completion we record
// the finished unit and the materials consumed so a defect can be traced forward
// to affected finished goods and backward to source lots/serials.

const createMock = vi.fn()

const tx = {
  productionGenealogy: {
    create: (...a: unknown[]) => createMock(...a),
  },
}

import { recordProductionGenealogy } from "@/lib/services/production-genealogy.service"

beforeEach(() => {
  createMock.mockReset()
  createMock.mockResolvedValue({})
})

describe("recordProductionGenealogy", () => {
  it("creates one genealogy row with the output unit and consumed materials", async () => {
    await recordProductionGenealogy(tx as never, {
      productionOrderId: 1,
      documentNo: "PO-001",
      outputItemId: 10,
      outputQty: 2,
      outputSerials: ["SN-A", "SN-B"],
      outputBatch: "B-1",
      unitCost: 500,
      totalCost: 1000,
      completedBy: 7,
      materials: [
        { itemId: 20, qty: 4, unitCost: 100, totalCost: 400 },
        { itemId: 21, qty: 2, unitCost: 300, totalCost: 600 },
      ],
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    const arg = createMock.mock.calls[0][0]
    expect(arg.data.productionOrderId).toBe(1)
    expect(arg.data.outputItemId).toBe(10)
    expect(Number(arg.data.outputQty)).toBe(2)
    expect(arg.data.outputSerials).toEqual(["SN-A", "SN-B"])
    expect(arg.data.outputBatch).toBe("B-1")
    expect(arg.data.completedBy).toBe(7)
    // Both material lines are nested-created.
    expect(arg.data.materials.create).toHaveLength(2)
    expect(arg.data.materials.create[0].itemId).toBe(20)
    expect(arg.data.materials.create[1].itemId).toBe(21)
    // No serials → the JSON column is left undefined (null), not an empty array.
  })

  it("omits outputSerials when none were supplied", async () => {
    await recordProductionGenealogy(tx as never, {
      productionOrderId: 2,
      documentNo: "PO-002",
      outputItemId: 11,
      outputQty: 1,
      outputSerials: [],
      outputBatch: null,
      unitCost: 10,
      totalCost: 10,
      completedBy: null,
      materials: [],
    })

    const arg = createMock.mock.calls[0][0]
    expect(arg.data.outputSerials).toBeUndefined()
    expect(arg.data.materials.create).toEqual([])
    expect(arg.data.completedBy).toBeNull()
  })
})
