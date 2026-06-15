import { describe, it, expect } from "vitest"
import { inventoryTransferSchema } from "@/lib/validations/inventory.schemas"

describe("inventoryTransferSchema — same-warehouse guard", () => {
  it("accepts a transfer between two distinct warehouses", () => {
    const r = inventoryTransferSchema.safeParse({
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      date: "2026-06-15",
    })
    expect(r.success).toBe(true)
  })

  it("rejects a transfer whose source and destination are the same warehouse", () => {
    // Regression: previously the schema had no cross-field check, so a
    // same-warehouse transfer would slip through. At runtime, onTransferProcessed
    // consumes FIFO layers out of the warehouse, then onTransferReceived creates
    // a fresh IN layer back into the SAME warehouse — collapsing multiple
    // distinct-cost FIFO layers into one weighted-average layer and corrupting
    // the cost basis for future stock-outs.
    const r = inventoryTransferSchema.safeParse({
      sourceWarehouseId: 7,
      destinationWarehouseId: 7,
      date: "2026-06-15",
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(" | ")
      expect(msg).toMatch(/tidak boleh sama|same/i)
    }
  })

  it("rejects even when both ids are coerced from string form fields", () => {
    // Mirrors how FormData reaches the schema in real server actions.
    const r = inventoryTransferSchema.safeParse({
      sourceWarehouseId: "5",
      destinationWarehouseId: "5",
      date: "2026-06-15",
    })
    expect(r.success).toBe(false)
  })
})
