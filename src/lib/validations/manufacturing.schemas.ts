import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNumber = () => z.coerce.number().optional()

// ==================== PRODUCT (BOM) ====================

export const createProductSchema = z.object({
  name: z.string().min(1, "Nama produk wajib diisi").max(255),
  code: optionalString(100),
  description: optionalString(1000),
  vehicleBrandId: optionalNumber(),
  vehicleModelId: optionalNumber(),
})

export type CreateProductInput = z.infer<typeof createProductSchema>

export const updateProductSchema = z.object({
  name: z.string().min(1, "Nama produk wajib diisi").max(255),
  code: optionalString(100),
  description: optionalString(1000),
  vehicleBrandId: optionalNumber(),
  vehicleModelId: optionalNumber(),
})

export type UpdateProductInput = z.infer<typeof updateProductSchema>

// ==================== PRODUCTION ORDER ====================

export const createProductionOrderSchema = z.object({
  productId: z.coerce.number().min(1, "Produk wajib dipilih"),
  qty: z.coerce.number().min(1, "Qty minimal 1"),
  startDate: optionalString(30),
  endDate: optionalString(30),
  notes: optionalString(1000),
})

export type CreateProductionOrderInput = z.infer<typeof createProductionOrderSchema>

export const updateProductionOrderSchema = z.object({
  productId: z.coerce.number().min(1, "Produk wajib dipilih"),
  qty: z.coerce.number().min(1, "Qty minimal 1"),
  startDate: optionalString(30),
  endDate: optionalString(30),
  notes: optionalString(1000),
})

export type UpdateProductionOrderInput = z.infer<typeof updateProductionOrderSchema>
