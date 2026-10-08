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
  "rework",
  "other",
] as const

export type ProductionCostCategory = (typeof PRODUCTION_COST_CATEGORIES)[number]

// Overhead drivers (PRD FAB-07: an auditable basis for overhead allocation).
export const OVERHEAD_DRIVERS = [
  "machine_hours",
  "labor_hours",
  "quantity",
  "skf",
] as const

export type OverheadDriver = (typeof OVERHEAD_DRIVERS)[number]

export const OVERHEAD_DRIVER_LABELS: Record<OverheadDriver, string> = {
  machine_hours: "Jam Mesin",
  labor_hours: "Jam Tenaga Kerja",
  quantity: "Kuantitas",
  skf: "Nilai SKF",
}

export const applyOverheadSchema = z.object({
  productionOrderId: z.coerce.number().int().positive({ message: "Perintah produksi wajib dipilih" }),
  driverType: z.enum(OVERHEAD_DRIVERS, { message: "Dasar alokasi overhead tidak valid" }),
  driverQty: z.coerce.number().min(0).max(1_000_000),
  rate: z.coerce.number().min(0).max(1_000_000_000),
  description: optionalString(2000),
})

export type ApplyOverheadInput = z.infer<typeof applyOverheadSchema>

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
