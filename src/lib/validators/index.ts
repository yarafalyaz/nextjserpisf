import { z } from "zod"

// ==================== AUTH VALIDATORS ====================

export const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Password lama wajib diisi"),
  newPassword: z.string().min(8, "Password baru minimal 8 karakter"),
  confirmPassword: z.string().min(1, "Konfirmasi password wajib diisi"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Konfirmasi password tidak cocok",
  path: ["confirmPassword"],
})

// ==================== MASTER DATA VALIDATORS ====================

export const customerSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  npwp: z.string().optional(),
  contactPerson: z.string().optional(),
  gender: z.string().optional(),
  code: z.string().optional(),
  street: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  village: z.string().optional(),
  postalCode: z.string().optional(),
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
  image: z.string().optional(),
  categoryId: z.number().optional(),
  brandId: z.number().optional(),
  vendorId: z.number().optional(),
  defaultWarehouseId: z.number().optional(),
  defaultRackId: z.number().optional(),
  defaultRackRowId: z.number().optional(),
  unitOfMeasure: z.string().default("PCS"),
  minStock: z.number().min(0).default(0),
  cost: z.number().min(0).default(0),
  price: z.number().min(0).default(0),
  standardCost: z.number().min(0).optional(),
  purchasePrice: z.number().min(0).optional(),
  costingMethod: z.string().optional(),
})

export const warehouseSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  code: z.string().optional(),
  address: z.string().optional(),
})

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
  baseSalary: z.number().min(0).default(0),
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
})

export const accountSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, "Nama akun wajib diisi"),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  parentId: z.number().optional(),
})

// ==================== SALES VALIDATORS ====================

export const quotationItemSchema = z.object({
  itemId: z.number().min(1, "Item wajib dipilih"),
  description: z.string().optional().default(""),
  qty: z.number().min(0.01, "Qty harus lebih dari 0"),
  uom: z.string().default("PCS"),
  unitPrice: z.number().min(0, "Harga tidak boleh negatif"),
  discountType: z.enum(["fixed", "percent"]).default("fixed"),
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
  notes: z.string().optional(),
  sections: z.array(quotationSectionSchema).min(1, "Minimal 1 section"),
})

export const salesPaymentSchema = z.object({
  salesInvoiceId: z.number().min(1, "Invoice wajib dipilih"),
  amount: z.number().min(0.01, "Jumlah harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal bayar wajib diisi"),
  paymentMethod: z.string().min(1, "Metode bayar wajib dipilih"),
  accountId: z.number().optional(),
  notes: z.string().optional(),
})

// ==================== PURCHASE VALIDATORS ====================

export const purchaseOrderSchema = z.object({
  vendorId: z.number().min(1, "Vendor wajib dipilih"),
  purchaseRequestId: z.number().optional(),
  date: z.string().min(1, "Tanggal wajib diisi"),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
})

export const purchaseOrderItemSchema = z.object({
  itemId: z.number().min(1, "Item wajib dipilih"),
  qty: z.number().min(0.01, "Qty harus lebih dari 0"),
  unitPrice: z.number().min(0, "Harga tidak boleh negatif"),
  discount: z.number().min(0).default(0),
})

export const goodsReceiptSchema = z.object({
  purchaseOrderId: z.number().min(1, "PO wajib dipilih"),
  warehouseId: z.number().min(1, "Warehouse wajib dipilih"),
  date: z.string().min(1, "Tanggal wajib diisi"),
  notes: z.string().optional(),
})

// ==================== INVENTORY VALIDATORS ====================

export const stockAdjustmentSchema = z.object({
  warehouseId: z.number().min(1, "Warehouse wajib dipilih"),
  date: z.string().min(1, "Tanggal wajib diisi"),
  reason: z.string().optional(),
})

export const stockAdjustmentItemSchema = z.object({
  itemId: z.number().min(1, "Item wajib dipilih"),
  systemQty: z.number().min(0),
  actualQty: z.number().min(0, "Qty aktual tidak boleh negatif"),
})

export const inventoryTransferSchema = z.object({
  sourceWarehouseId: z.number().min(1, "Gudang asal wajib dipilih"),
  destinationWarehouseId: z.number().min(1, "Gudang tujuan wajib dipilih"),
  date: z.string().min(1, "Tanggal wajib diisi"),
  notes: z.string().optional(),
}).refine((data) => data.sourceWarehouseId !== data.destinationWarehouseId, {
  message: "Gudang asal dan tujuan tidak boleh sama",
  path: ["destinationWarehouseId"],
})

export const materialIssueSchema = z.object({
  warehouseId: z.number().min(1, "Warehouse wajib dipilih"),
  projectId: z.number().optional(),
  workOrderId: z.number().optional(),
  date: z.string().min(1, "Tanggal wajib diisi"),
  notes: z.string().optional(),
})

// ==================== FINANCE VALIDATORS ====================

export const journalSchema = z.object({
  transactionDate: z.string().min(1, "Tanggal wajib diisi"),
  description: z.string().optional(),
  type: z.enum(["GENERAL", "ADJUSTMENT", "PRODUCTION"]).default("GENERAL"),
})

export const journalEntrySchema = z.object({
  accountId: z.number().min(1, "Akun wajib dipilih"),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  memo: z.string().optional(),
}).refine((data) => data.debit > 0 || data.credit > 0, {
  message: "Debit atau credit harus diisi",
})

export const expenseSchema = z.object({
  accountId: z.number().min(1, "Akun beban wajib dipilih"),
  paidFromAccountId: z.number().optional(),
  projectId: z.number().optional(),
  amount: z.number().min(0.01, "Jumlah harus lebih dari 0"),
  date: z.string().min(1, "Tanggal wajib diisi"),
  referenceNo: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  receiptImage: z.string().optional(),
})

export const pettyCashSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amount: z.number().min(0.01, "Jumlah harus lebih dari 0"),
  date: z.string().min(1, "Tanggal wajib diisi"),
  accountId: z.number().optional(),
  description: z.string().optional(),
})

// ==================== HRM VALIDATORS ====================

export const leaveRequestSchema = z.object({
  employeeId: z.number().min(1, "Karyawan wajib dipilih"),
  type: z.string().min(1, "Tipe cuti wajib dipilih"),
  startDate: z.string().min(1, "Tanggal mulai wajib diisi"),
  endDate: z.string().min(1, "Tanggal selesai wajib diisi"),
  reason: z.string().optional(),
})

export const overtimeRequestSchema = z.object({
  employeeId: z.number().min(1, "Karyawan wajib dipilih"),
  date: z.string().min(1, "Tanggal wajib diisi"),
  hours: z.number().min(0.5, "Minimal 0.5 jam"),
  reason: z.string().optional(),
})

export const payrollSchema = z.object({
  period: z.string().min(1, "Periode wajib diisi"),
  startDate: z.string().min(1, "Tanggal mulai wajib diisi"),
  endDate: z.string().min(1, "Tanggal selesai wajib diisi"),
})

// ==================== TYPE EXPORTS ====================

export type LoginInput = z.infer<typeof loginSchema>
export type CustomerInput = z.infer<typeof customerSchema>
export type VendorInput = z.infer<typeof vendorSchema>
export type ItemInput = z.infer<typeof itemSchema>
export type WarehouseInput = z.infer<typeof warehouseSchema>
export type EmployeeInput = z.infer<typeof employeeSchema>
export type AccountInput = z.infer<typeof accountSchema>
export type QuotationInput = z.infer<typeof quotationSchema>
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>
export type JournalInput = z.infer<typeof journalSchema>
export type ExpenseInput = z.infer<typeof expenseSchema>
export type PettyCashInput = z.infer<typeof pettyCashSchema>
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>

export type SalesPaymentInput = z.infer<typeof salesPaymentSchema>
