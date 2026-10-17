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
  code: optionalString(50),
  taxId: optionalString(50),
  customerCategoryId: optionalNumber(),
})

export const customerCategorySchema = z.object({
  name: z.string().min(1, "Nama kategori wajib diisi").max(200),
  downPaymentPercent: z.coerce.number().min(0, "Persentase minimal 0").max(100, "Persentase maksimal 100").default(0),
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
  groupId: optionalNumber(),
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
  isService: optionalBoolean,
  trackBatch: optionalBoolean,
  trackSerial: optionalBoolean,
  image: z.string().optional(),
})

// Server-action variants of the master data schemas. They mirror the form
// schemas in @/lib/validations/form.schemas.ts but add z.coerce.number() for the
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
  description: optionalString(1000),
  // The account-form renders a "Saldo Normal" select (DEBIT/CREDIT) and writes
  // it to a form field, but the previous schema dropped it. The Account model
  // column is required by every report/filter (trial balance, financial
  // statements) — an unset value silently misclassifies the account.
  normalBalance: z
    .enum(["DEBIT", "CREDIT"], {
      message: "Saldo normal harus DEBIT atau CREDIT",
    })
    .optional(),
})

// ==================== KARYAWAN (form) ====================
export const employeeSchema = z.object({
  employeeNo: z.string().optional(),
  name: z.string().min(1, "Nama wajib diisi"),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  phone: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  maritalStatus: z.string().optional(),
  departmentId: z.number().optional(),
  positionId: z.number().optional(),
  joinDate: z.string().min(1, "Tanggal masuk wajib diisi"),
  paymentFrequency: z.string().default("MONTHLY"),
  baseSalary: z.number().min(0).default(0).or(z.string().transform((val) => Number(val.replace(/\D/g, '')) || 0)),
  idNumber: z.string().optional(),
  npwp: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountHolder: z.string().optional(),
  bpjsKetenagakerjaan: z.string().optional(),
  bpjsKesehatan: z.string().optional(),
  street: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  village: z.string().optional(),
  postalCode: z.string().optional(),
  // Optional login account — when enabled, the employee gets a User account
  // (email + password + roles) so they can sign in (e.g. for self-attendance).
  createLoginAccount: z.boolean().optional(),
  loginPassword: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.createLoginAccount) {
    if (!data.email || data.email.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Email wajib diisi untuk akun login" })
    }
    if (!data.loginPassword || data.loginPassword.length < 8) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["loginPassword"], message: "Kata sandi minimal 8 karakter" })
    }
  }
})

