import { z } from "zod"
import "./zod-locale";
import { parseMoneyAmount } from "@/lib/utils/parse-money"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

/** Nominal uang: parse format Indonesia dulu — z.coerce.number mentah membaca "2.000.000" sebagai 2. */
const moneyField = (max: number) =>
  z.preprocess(
    // Tak terbaca: teruskan string aslinya supaya coerce gagal (NaN), bukan null->0.
    (v) => (typeof v === "string" ? (parseMoneyAmount(v) ?? v) : v),
    z.coerce.number({ message: "Nominal tidak valid" }).min(0).max(max),
  )

const optionalMoneyField = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? undefined : typeof v === "string" ? (parseMoneyAmount(v) ?? v) : v),
    z.coerce.number({ message: "Nominal tidak valid" }).min(0).max(max).optional(),
  )

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

// Overhead drivers (PRD FAB-07: an auditable basis for overhead allocation).
export const OVERHEAD_DRIVERS = [
  "machine_hours",
  "labor_hours",
  "quantity",
] as const

export type OverheadDriver = (typeof OVERHEAD_DRIVERS)[number]

export const OVERHEAD_DRIVER_LABELS: Record<OverheadDriver, string> = {
  machine_hours: "Jam Mesin",
  labor_hours: "Jam Tenaga Kerja",
  quantity: "Kuantitas",
}

export const applyOverheadSchema = z.object({
  productionOrderId: z.coerce.number().int().positive({ message: "Perintah produksi wajib dipilih" }),
  driverType: z.enum(OVERHEAD_DRIVERS, { message: "Dasar alokasi overhead tidak valid" }),
  driverQty: z.coerce.number().min(0).max(1_000_000),
  rate: moneyField(1_000_000_000),
  description: optionalString(2000),
})

export const createProductionCostSchema = z.object({
  productionOrderId: optionalPositiveId(),
  workOrderId: optionalPositiveId(),
  category: z.enum(PRODUCTION_COST_CATEGORIES, { message: "Kategori biaya tidak valid" }),
  description: optionalString(2000),
  hours: z.coerce.number().min(0).max(1_000_000).optional(),
  rate: optionalMoneyField(1_000_000_000),
  amount: moneyField(1_000_000_000_000),
  vendorId: optionalPositiveId(),
  referenceNo: optionalString(200),
})

export const updateProductionCostSchema = z.object({
  category: z.enum(PRODUCTION_COST_CATEGORIES, { message: "Kategori biaya tidak valid" }),
  description: optionalString(2000),
  hours: z.coerce.number().min(0).max(1_000_000).optional(),
  rate: optionalMoneyField(1_000_000_000),
  amount: moneyField(1_000_000_000_000),
  vendorId: optionalPositiveId(),
  referenceNo: optionalString(200),
})
