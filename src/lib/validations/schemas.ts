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
  npwp: z
    .string()
    .regex(/^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$/, "Format NPWP tidak valid")
    .optional()
    .or(z.literal("").transform(() => undefined)),
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

export type CustomerInput = z.infer<typeof customerSchema>
export type VendorInput = z.infer<typeof vendorSchema>
export type ItemInput = z.infer<typeof itemSchema>
