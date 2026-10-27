/**

 * Skema VALIDASI SISI-FORM (react-hook-form) — bagian dari pohon kanonik

 * `src/lib/validations/`.

 *

 * Kenapa terpisah dari skema server (`schemas.ts`, `*.schemas.ts`)? Form memegang nilai

 * yang sudah bertipe (number/Date), sedangkan skema server men-`coerce` string dari

 * FormData. Aturannya tetap satu: jangan menyalin ulang aturan validasi di sini —

 * modul ini HANYA untuk tipe form, dan perubahannya harus mengikuti skema server.

 *

 * Berkas ini dulu hidup di `src/lib/validators/index.ts` (pohon kedua yang terpisah),

 * berisi 28 skema padahal hanya 9 yang dipakai form — drift yang ditemukan: form vendor

 * mengirim `district`/`village` sementara skema server memakai

 * `districtVendor`/`villageVendor`, sehingga kecamatan/desa vendor tidak pernah tersimpan.

 */

import { passwordPolicyError } from "@/lib/auth/password-policy"
import { z } from "zod"
import "./zod-locale";



export const customerSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  contactPerson: z.string().optional(),
  gender: z.string().optional(),
  code: z.string().optional(),
  street: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  village: z.string().optional(),
  postalCode: z.string().optional(),
  taxId: z.string().max(50).optional(),
  // F-2026-10-25-004-S: identitas pajak terstruktur. Semua opsional,
  // tanpa aturan bentuk di klien — validasi bentuk + peringatan
  // ditegakkan server (customerTaxIdentityForSave), pesan tampil verbatim.
  taxpayerName: z.string().max(200).optional(),
  taxAddress: z.string().max(2000).optional(),
  nitku: z.string().max(50).optional(),
  pkpStatus: z.string().optional(),
  pkpEffectiveFrom: z.string().optional(),
  pkpSource: z.string().max(200).optional(),
  customerCategoryId: z.number().optional().nullable(),
})

export const vendorSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, "Nama wajib diisi"),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  npwp: z.string().optional(),
  contactPerson: z.string().optional(),
  paymentTermId: z.number().optional(),
  street: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  village: z.string().optional(),
  postalCode: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountHolder: z.string().optional(),
})

export const itemSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1, "Nama wajib diisi"),
  description: z.string().optional(),
  image: z.string().min(1, "Foto item wajib diunggah"),
  categoryId: z.number({ error: "Kategori wajib dipilih" }).int().positive("Kategori wajib dipilih"),
  groupId: z.number().int().positive().optional(),
  brandId: z.number({ error: "Merek wajib dipilih" }).int().positive("Merek wajib dipilih"),
  vendorId: z.number({ error: "Vendor wajib dipilih" }).int().positive("Vendor wajib dipilih"),
  defaultWarehouseId: z.number({ error: "Gudang wajib dipilih" }).int().positive("Gudang wajib dipilih"),
  defaultRackId: z.number({ error: "Rak wajib dipilih" }).int().positive("Rak wajib dipilih"),
  defaultRackRowId: z.number().int().positive().optional(),
  unitOfMeasure: z.string().min(1, "Satuan wajib dipilih").default("PCS"),
  minStock: z.number().min(0).default(0),
  cost: z.number().min(1, "Harga beli wajib diisi dan harus lebih dari 0"),
  price: z.number().min(1, "Harga jual wajib diisi dan harus lebih dari 0"),
  standardCost: z.number().min(0).optional(),
  purchasePrice: z.number().min(0).optional(),
  costingMethod: z.string().optional(),
  // F-2026-10-24-135-V: penanda besi tua; server (schemas.ts) sudah terima,
  // form wajib meneruskan supaya toggle benar-benar tersimpan.
  isScrapSaleItem: z.boolean().optional(),
}).refine((data) => data.price >= data.cost, {
  message: "Harga jual tidak boleh lebih rendah dari harga beli (modal). Diskon diterapkan saat penawaran/penjualan, bukan di master.",
  path: ["price"],
})

export const employeeSchema = z.object({
  employeeNo: z.string().optional(),
  name: z.string().min(1, "Nama wajib diisi"),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  phone: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  maritalStatus: z.string().optional(),
  // P1-6: jumlah tanggungan untuk PTKP (0-3).
  dependents: z.coerce.number().int().min(0).max(3).default(0),
  departmentId: z.number().optional(),
  positionId: z.number().optional(),
  managerId: z.number().nullable().optional(),
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
  // F-2026-10-22-085-S (Q-EMP-1/2): status kepegawaian + tanggal siklus
  // hidup. Kosakata ditolak server bila di luar daftar; di sini hanya
  // pasangan tanggal+alasan berhenti yang dijaga, pesan persis server.
  employmentStatus: z.string().optional(),
  leaveEligibilityStartDate: z.string().optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  employmentEndedAt: z.string().optional(),
  endReason: z.string().optional(),
}).superRefine((data, ctx) => {
  const hasEndedAt = !!data.employmentEndedAt?.trim()
  const hasEndReason = !!data.endReason?.trim()
  if (hasEndedAt !== hasEndReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [hasEndedAt ? "endReason" : "employmentEndedAt"],
      message: "Tanggal berhenti dan alasan berhenti wajib diisi bersamaan",
    })
  }
  if (data.createLoginAccount) {
    if (!data.email || data.email.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Email wajib diisi untuk akun login" })
    }
    const loginPasswordIssue = passwordPolicyError(data.loginPassword ?? "", "Kata sandi")
    if (loginPasswordIssue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["loginPassword"], message: loginPasswordIssue })
    }
  }
})

export const warehouseSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  code: z.string().optional(),
  address: z.string().optional(),
})

export const salesPaymentSchema = z.object({
  salesInvoiceId: z.number().min(1, "Invoice wajib dipilih"),
  amount: z.number().min(0.01, "Jumlah harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal bayar wajib diisi"),
  paymentMethod: z.string().min(1, "Metode bayar wajib dipilih"),
  accountId: z.number().optional(),
  // PPh yang dipotong pelanggan (opsional); `amount` tetap berarti kas diterima.
  withholdingTypeId: z.number().optional(),
  withholdingAmount: z.number().min(0).optional(),
  withholdingCertificateNo: z.string().optional(),
  withholdingDate: z.string().optional(),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
})

// ==================== PURCHASE VALIDATORS ====================

export const purchaseOrderSchema = z.object({
  vendorId: z.number().min(1, "Vendor wajib dipilih"),
  purchaseRequestId: z.number().optional(),
  date: z.string().min(1, "Tanggal wajib diisi"),
  expectedDate: z.string().optional(),
  paymentTerm: z.string().optional(),
  shippingCost: z.number().min(0).optional(),
  serviceFee: z.number().min(0).optional(),
  notes: z.string().optional(),
})

import { DISCOUNT_TYPES } from "@/lib/constants/status"

export const quotationItemSchema = z.object({
  itemId: z.number().nullable().optional(),
  isCustom: z.boolean().optional().default(false),
  description: z.string().optional().default(""),
  qty: z.number().min(0.01, "Qty harus lebih dari 0"),
  uom: z.string().default("PCS"),
  unitPrice: z.number().min(0, "Harga tidak boleh negatif"),
  discountType: z.enum(DISCOUNT_TYPES).default("fixed"),
  discount: z.number().min(0).default(0),
  total: z.number().min(0).default(0),
})

export const quotationSectionSchema = z.object({
  name: z.string().default(""),
  items: z.array(quotationItemSchema).min(1, "Minimal 1 item per section"),
})

export const quotationSchema = z.object({
  customerId: z.number().min(1, "Customer wajib dipilih"),
  customerVehicleId: z.number().optional(),
  date: z.string().min(1, "Tanggal wajib diisi"),
  validUntil: z.string().optional(),
  subtotal: z.number().default(0),
  discount: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  grandTotal: z.number().default(0),
  paymentMethod: z.string().optional(),
  shippingMethod: z.string().optional(),
  notes: z.string().optional(),
  sections: z.array(quotationSectionSchema).min(1, "Minimal 1 section"),
})

export const expenseSchema = z.object({
  accountId: z.number().min(1, "Akun beban wajib dipilih"),
  paidFromAccountId: z.number().optional(),
  projectId: z.number().optional(),
  amount: z.number().min(0.01, "Jumlah harus lebih dari 0"),
  date: z.string().min(1, "Tanggal wajib diisi"),
  referenceNo: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.number().optional(),
  vendorId: z.number().optional(),
  receiptImage: z.string().optional(),
})



export type CustomerInput = z.infer<typeof customerSchema>

export type VendorInput = z.infer<typeof vendorSchema>

export type ItemInput = z.infer<typeof itemSchema>

export type EmployeeInput = z.infer<typeof employeeSchema>

export type WarehouseInput = z.infer<typeof warehouseSchema>

export type SalesPaymentInput = z.infer<typeof salesPaymentSchema>

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>

export type QuotationInput = z.infer<typeof quotationSchema>

export type ExpenseInput = z.infer<typeof expenseSchema>
