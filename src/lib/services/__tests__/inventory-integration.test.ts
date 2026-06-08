import "dotenv/config"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "../../db/prisma"
import { toBaseFactor, toBaseQty } from "../uom.service"
import { consumeFifoLayers, createInLayer, availableQty } from "../inventory-fifo"

/**
 * DB integration tests for the per-warehouse FIFO + Multi-UoM + Batch/Serial
 * engine. Each test creates and cleans up its own data. If the database is not
 * reachable (e.g. local run without DB), the whole suite is skipped gracefully
 * so it never breaks the unit-test stage.
 */
let dbUp = false
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
    dbUp = true
  } catch {
    dbUp = false
  }
})
afterAll(async () => {
  try { await prisma.$disconnect() } catch { /* ignore */ }
})

describe("Inventory engine (DB integration)", () => {
  it("enforces per-warehouse FIFO isolation, multi-UoM, batch & serial", async () => {
    if (!dbUp) { console.warn("DB not reachable — skipping integration test"); return }

    const stamp = Date.now()
    const whA = await prisma.warehouse.create({ data: { code: `ITA${stamp}`, name: `ITA ${stamp}` } })
    const whB = await prisma.warehouse.create({ data: { code: `ITB${stamp}`, name: `ITB ${stamp}` } })
    const item = await prisma.item.create({
      data: { sku: `IT${stamp}`, name: `IT ${stamp}`, unitOfMeasure: "PCS", trackBatch: true, trackSerial: true, isProduct: true, qtyOnHand: 0 },
    })
    await prisma.uomConversion.create({ data: { itemId: item.id, code: "BOX", factorToBase: 12 } })

    const moveIds: number[] = []
    try {
      // Multi-UoM conversion
      await prisma.$transaction(async (tx) => {
        expect(await toBaseFactor(tx, item.id, "BOX")).toBe(12)
        expect(await toBaseFactor(tx, item.id, "PCS")).toBe(1)
        expect(await toBaseQty(tx, item.id, "BOX", 2)).toBe(24)
      })

      // Inbound: 10 in A (BATCH-A), 5 in B (BATCH-B)
      const mvA = await prisma.stockMove.create({ data: { documentNo: `ITSMA${stamp}`, itemId: item.id, warehouseId: whA.id, qty: 10, cost: 100, impact: "IN", status: "posted" } })
      const mvB = await prisma.stockMove.create({ data: { documentNo: `ITSMB${stamp}`, itemId: item.id, warehouseId: whB.id, qty: 5, cost: 120, impact: "IN", status: "posted" } })
      moveIds.push(mvA.id, mvB.id)
      await prisma.$transaction(async (tx) => {
        await createInLayer(tx, { itemId: item.id, warehouseId: whA.id, batchNumber: "BATCH-A", stockMoveId: mvA.id, qty: 10, unitCost: 100 })
        await createInLayer(tx, { itemId: item.id, warehouseId: whB.id, batchNumber: "BATCH-B", stockMoveId: mvB.id, qty: 5, unitCost: 120 })
      })
      await prisma.itemBatch.create({ data: { itemId: item.id, batchNumber: "BATCH-A", warehouseId: whA.id, qty: 10 } })
      for (let i = 1; i <= 10; i++) {
        await prisma.itemSerial.create({ data: { itemId: item.id, serialNumber: `ISN-${stamp}-${i}`, warehouseId: whA.id, status: "available" } })
      }

      // Per-warehouse availability
      await prisma.$transaction(async (tx) => {
        expect(await availableQty(tx, item.id, whA.id)).toBe(10)
        expect(await availableQty(tx, item.id, whB.id)).toBe(5)
        expect(await availableQty(tx, item.id, null)).toBe(15)
      })

      // Consuming 8 from B must fail (only 5 there) even though global has 15
      let threw = false
      try {
        await prisma.$transaction((tx) => consumeFifoLayers(tx, { itemId: item.id, warehouseId: whB.id, qty: 8 }))
      } catch { threw = true }
      expect(threw).toBe(true)

      // Consuming 6 from A: succeeds, batch A -> 4, 6 serials used
      const res = await prisma.$transaction((tx) => consumeFifoLayers(tx, { itemId: item.id, warehouseId: whA.id, qty: 6 }))
      expect(Number(res.consumedCost)).toBe(600)
      const batchA = await prisma.itemBatch.findFirst({ where: { itemId: item.id, batchNumber: "BATCH-A" } })
      expect(Number(batchA?.qty)).toBe(4)
      const used = await prisma.itemSerial.count({ where: { itemId: item.id, status: "used" } })
      expect(used).toBe(6)
      const remainingA = await prisma.$transaction((tx) => availableQty(tx, item.id, whA.id))
      expect(remainingA).toBe(4)
    } finally {
      await prisma.itemSerial.deleteMany({ where: { itemId: item.id } })
      await prisma.itemBatch.deleteMany({ where: { itemId: item.id } })
      await prisma.inventoryLayer.deleteMany({ where: { itemId: item.id } })
      await prisma.stockMove.deleteMany({ where: { id: { in: moveIds } } })
      await prisma.uomConversion.deleteMany({ where: { itemId: item.id } })
      await prisma.item.delete({ where: { id: item.id } })
      await prisma.warehouse.deleteMany({ where: { id: { in: [whA.id, whB.id] } } })
    }
  })
})
