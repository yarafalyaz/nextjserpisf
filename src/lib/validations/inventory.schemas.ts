import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNumber = (min?: number) => {
  const base = min !== undefined ? z.number().min(min) : z.number()
  return base.optional()
}

const dateString = z.string().min(1, "Tanggal wajib diisi")

// ==================== STOCK ADJUSTMENT ====================

export const stockAdjustmentSchema = z.object({
  warehouseId: z.number().min(1, "Gudang wajib dipilih"),
  date: dateString,
  reason: optionalString(500),
  type: optionalString(50),
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
})

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>

// ==================== INVENTORY TRANSFER ====================

export const inventoryTransferSchema = z.object({
  sourceWarehouseId: z.number().min(1, "Gudang asal wajib dipilih"),
  destinationWarehouseId: z.number().min(1, "Gudang tujuan wajib dipilih"),
  date: dateString,
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
})

export type InventoryTransferInput = z.infer<typeof inventoryTransferSchema>

// ==================== MATERIAL ISSUE ====================

export const materialIssueSchema = z.object({
  warehouseId: z.number().min(1, "Gudang wajib dipilih"),
  projectId: optionalNumber(),
  workOrderId: optionalNumber(),
  date: dateString,
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
})

export type MaterialIssueInput = z.infer<typeof materialIssueSchema>
