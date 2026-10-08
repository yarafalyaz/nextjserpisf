import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalPositiveId = () =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().positive().optional(),
  )

// ==================== PRODUCTION COST (non-material) ====================
// PRD FAB-06/07/08/09: direct labor, machine, applied overhead, and
// subcontract/service cost lines that roll into a production order's HPP.

export const PRODUCTION_COST_CATEGORIES = [
  "labor",
  "machine",
  "overhead",
  "subcontract",
  "service",
  "other",
] as const

export type ProductionCostCategory = (typeof PRODUCTION_COST_CATEGORIES)[number]

export const createProductionCostSchema = z.object({
  productionOrderId: optionalPositiveId(),
  workOrderId: optionalPositiveId(),
  category: z.enum(PRODUCTION_COST_CATEGORIES, { message: "Kategori biaya tidak valid" }),
  description: optionalString(2000),
  hours: z.coerce.number().min(0).max(1_000_000).optional(),
  rate: z.coerce.number().min(0).max(1_000_000_000).optional(),
  amount: z.coerce.number().min(0).max(1_000_000_000_000),
  vendorId: optionalPositiveId(),
  referenceNo: optionalString(200),
})

export type CreateProductionCostInput = z.infer<typeof createProductionCostSchema>

export const updateProductionCostSchema = z.object({
  category: z.enum(PRODUCTION_COST_CATEGORIES, { message: "Kategori biaya tidak valid" }),
  description: optionalString(2000),
  hours: z.coerce.number().min(0).max(1_000_000).optional(),
  rate: z.coerce.number().min(0).max(1_000_000_000).optional(),
  amount: z.coerce.number().min(0).max(1_000_000_000_000),
  vendorId: optionalPositiveId(),
  referenceNo: optionalString(200),
})
