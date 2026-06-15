import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNumber = (min?: number) => {
  const base = min !== undefined ? z.coerce.number().min(min) : z.coerce.number()
  return base.optional()
}

const optionalBoolean = z.boolean().optional()

export const customerSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200),
  email: z.string().email("Email tidak valid").max(100).optional().or(z.literal("").transform(() => undefined)),
  phone: optionalString(30),
  address: optionalString(200),
  city: optionalString(200),
  street: optionalString(200),
  province: optionalString(200),
  district: optionalString(200),
  village: optionalString(200),
  postalCode: optionalString(200),
  contactPerson: optionalString(100),
  gender: z.enum(["male", "female"]).optional(),
  creditLimit: optionalNumber(0),
  code: optionalString(50),
})

export const vendorSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200),
  email: z.string().email("Email tidak valid").max(100).optional().or(z.literal("").transform(() => undefined)),
  phone: optionalString(30),
  address: optionalString(200),
  city: optionalString(200),
  street: optionalString(200),
  province: optionalString(200),
  postalCode: optionalString(200),
  districtVendor: optionalString(200),
  villageVendor: optionalString(200),
  npwp: optionalString(200),
  contactPerson: optionalString(100),
  paymentTermId: optionalNumber(),
  bankName: optionalString(100),
  bankAccountNumber: optionalString(100),
  bankAccountHolder: optionalString(100),
  code: optionalString(50),
})

export const itemSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200),
  description: optionalString(500),
  sku: optionalString(50),
  categoryId: optionalNumber(),
  brandId: optionalNumber(),
  vendorId: optionalNumber(),
  defaultWarehouseId: optionalNumber(),
  defaultRackId: optionalNumber(),
  defaultRackRowId: optionalNumber(),
  unitOfMeasure: z.string().max(20).default("PCS"),
  minStock: optionalNumber(0),
  cost: z.coerce.number().min(0, "Harga beli minimal 0"),
  price: z.coerce.number().min(0, "Harga jual minimal 0"),
  standardCost: optionalNumber(0),
  purchasePrice: optionalNumber(0),
  costingMethod: z.string().optional(),
  isProduct: optionalBoolean,
  trackBatch: optionalBoolean,
  trackSerial: optionalBoolean,
  image: z.string().optional(),
})

// Server-action variants of the master data schemas. They mirror the form
// schemas in @/lib/validators/index.ts but add z.coerce.number() for the
// numeric fields, because FormData entries arrive as strings and the shared
// form schemas assume react-hook-form has already coerced the values. Using
// these in the server actions closes the Zod validation bypass (e.g. an
// authenticated editor posting an arbitrary account `type` cast through
// `as "ASSET" | "LIABILITY" | ...`, which would silently corrupt the chart
// of accounts and the balance sheet / income statement / trial balance
// grouping).
export const warehouseServerSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200),
  code: optionalString(50),
  address: optionalString(500),
})

export const accountServerSchema = z.object({
  code: optionalString(50),
  name: z.string().min(1, "Nama akun wajib diisi").max(200),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"], {
    message: "Tipe akun harus salah satu dari ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE",
  }),
  parentId: optionalNumber(),
})

export type CustomerInput = z.infer<typeof customerSchema>
export type VendorInput = z.infer<typeof vendorSchema>
export type ItemInput = z.infer<typeof itemSchema>
export type WarehouseServerInput = z.infer<typeof warehouseServerSchema>
export type AccountServerInput = z.infer<typeof accountServerSchema>
