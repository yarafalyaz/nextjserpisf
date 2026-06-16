import { z } from "zod"

// ==================== Helpers ====================

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNumber = (min?: number) => {
  const base = min !== undefined ? z.coerce.number().min(min) : z.coerce.number()
  return base.optional()
}

const dateString = z.string().min(1, "Tanggal wajib diisi")

const optionalStr = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const requiredStr = (msg: string, max = 200) =>
  z.string().min(1, msg).max(max)

const requiredId = (field: string) =>
  z.coerce.number({ error: `${field} wajib diisi` }).int().positive()

const optionalId = z.coerce.number().int().positive().optional()

const optionalDateString = z.string().optional()

// ==================== STOCK ADJUSTMENT ====================

export const stockAdjustmentSchema = z.object({
  warehouseId: z.coerce.number().min(1, "Gudang wajib dipilih"),
  date: dateString,
  reason: optionalString(500),
  type: optionalString(50),
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
})

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>

// ==================== INVENTORY TRANSFER ====================

export const inventoryTransferSchema = z.object({
  sourceWarehouseId: z.coerce.number().min(1, "Gudang asal wajib dipilih"),
  destinationWarehouseId: z.coerce.number().min(1, "Gudang tujuan wajib dipilih"),
  date: dateString,
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
}).refine((data) => data.sourceWarehouseId !== data.destinationWarehouseId, {
  message: "Gudang asal dan tujuan tidak boleh sama",
  path: ["destinationWarehouseId"],
})

export type InventoryTransferInput = z.infer<typeof inventoryTransferSchema>

// ==================== MATERIAL ISSUE ====================

export const materialIssueSchema = z.object({
  warehouseId: z.coerce.number().min(1, "Gudang wajib dipilih"),
  projectId: optionalNumber(),
  workOrderId: optionalNumber(),
  date: dateString,
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
})

export type MaterialIssueInput = z.infer<typeof materialIssueSchema>

// ==================== WORK ORDER ====================

export const workOrderSchema = z.object({
  customerId: requiredId("Pelanggan"),
  projectId: optionalId,
  quotationId: optionalId,
  date: dateString,
  startDate: optionalDateString,
  endDate: optionalDateString,
  notes: optionalStr(2000),
  items: optionalStr(50000), // JSON string, parsed separately
})

export type WorkOrderInput = z.infer<typeof workOrderSchema>

// ==================== RACK ====================

export const rackSchema = z.object({
  code: optionalStr(50),
  name: requiredStr("Nama rak wajib diisi", 100),
  warehouseId: requiredId("Gudang"),
})

export type RackInput = z.infer<typeof rackSchema>

// ==================== RACK ROW ====================

export const rackRowSchema = z.object({
  rackId: requiredId("Rak"),
  code: optionalStr(50),
  name: requiredStr("Nama baris rak wajib diisi", 100),
})

export type RackRowInput = z.infer<typeof rackRowSchema>
