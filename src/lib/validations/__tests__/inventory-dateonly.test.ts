import { describe, it, expect } from "vitest"
import {
  stockAdjustmentSchema,
  inventoryTransferSchema,
  materialIssueSchema,
  workOrderSchema,
} from "@/lib/validations/inventory.schemas"

/**
 * Tanggal dokumen inventaris wajib kalender-valid: `2026-02-30` tidak boleh
 * menggulir diam-diam ke 2 Mar lewat `new Date(...)` di action — tanggal stok
 * memengaruhi FIFO, kartu stok, dan assertPeriodOpen.
 */
describe("inventory schemas — tanggal kalender", () => {
  it("stockAdjustmentSchema rejects fictitious date", () => {
    expect(stockAdjustmentSchema.safeParse({ warehouseId: 1, date: "2026-02-30" }).success).toBe(false)
    expect(stockAdjustmentSchema.safeParse({ warehouseId: 1, date: "2028-02-29" }).success).toBe(true)
  })

  it("inventoryTransferSchema rejects fictitious date", () => {
    const base = { sourceWarehouseId: 1, destinationWarehouseId: 2 }
    expect(inventoryTransferSchema.safeParse({ ...base, date: "2026-13-01" }).success).toBe(false)
    expect(inventoryTransferSchema.safeParse({ ...base, date: "2026-06-09" }).success).toBe(true)
  })

  it("materialIssueSchema rejects free-text date", () => {
    expect(materialIssueSchema.safeParse({ warehouseId: 1, date: "besok" }).success).toBe(false)
  })

  it("workOrderSchema rejects fictitious date/startDate/endDate, accepts empty optional", () => {
    const base = { customerId: 1, date: "2026-06-09" }
    expect(workOrderSchema.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false)
    expect(workOrderSchema.safeParse({ ...base, startDate: "2026-02-30" }).success).toBe(false)
    expect(workOrderSchema.safeParse({ ...base, endDate: "2026-02-30" }).success).toBe(false)
    expect(workOrderSchema.safeParse({ ...base, startDate: "", endDate: "" }).success).toBe(true)
    expect(workOrderSchema.safeParse({ ...base, startDate: "2026-03-01" }).success).toBe(true)
  })
})
