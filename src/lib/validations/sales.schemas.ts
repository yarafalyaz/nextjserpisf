import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const requiredId = z.coerce.number().min(1, "ID wajib diisi")
const optionalId = z.coerce.number().min(1).optional()
const optionalNumber = z.coerce.number().min(0).optional()

// ==================== QUOTATION ====================

export const updateQuotationSchema = z.object({
  customerId: optionalId,
  customerVehicleId: optionalId,
  date: optionalString(50),
  validUntil: optionalString(50),
  paymentMethod: optionalString(200),
  shippingMethod: optionalString(200),
  notes: optionalString(500),
})

// ==================== DOWN PAYMENT ====================

export const createDownPaymentSchema = z.object({
  quotationId: requiredId,
  amount: z.coerce.number().min(1, "Jumlah uang muka harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal pembayaran wajib diisi").max(50),
  paymentMethod: optionalString(200),
  notes: optionalString(500),
})

export const updateDownPaymentSchema = z.object({
  quotationId: requiredId,
  amount: z.coerce.number().min(1, "Jumlah uang muka harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal pembayaran wajib diisi").max(50),
  paymentMethod: optionalString(200),
  notes: optionalString(500),
})

// ==================== SALES ORDER ====================

export const createSalesOrderSchema = z.object({
  customerId: requiredId,
  quotationId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  deliveryDate: optionalString(50),
  notes: optionalString(500),
})

export const updateSalesOrderSchema = z.object({
  customerId: requiredId,
  quotationId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  deliveryDate: optionalString(50),
  notes: optionalString(500),
})

// ==================== SALES INVOICE ====================

export const createSalesInvoiceSchema = z.object({
  customerId: requiredId,
  salesOrderId: optionalId,
  quotationId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  dueDate: optionalString(50),
})

export const updateSalesInvoiceSchema = z.object({
  customerId: requiredId,
  salesOrderId: optionalId,
  quotationId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  dueDate: optionalString(50),
  items: optionalString(50000),
  taxRate: z.coerce.number().optional(),
  discount: z.coerce.number().optional(),
})

// ==================== SALES PAYMENT ====================

export const createSalesPaymentSchema = z.object({
  salesInvoiceId: requiredId,
  amount: z.coerce.number().min(1, "Jumlah pembayaran harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal pembayaran wajib diisi").max(50),
  paymentMethod: z.string().min(1, "Metode pembayaran wajib diisi").max(200),
  accountId: optionalId,
  notes: optionalString(500),
  attachmentIds: optionalString(2000),
})

export const updateSalesPaymentSchema = z.object({
  salesInvoiceId: requiredId,
  amount: z.coerce.number().min(1, "Jumlah pembayaran harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal pembayaran wajib diisi").max(50),
  paymentMethod: z.string().min(1, "Metode pembayaran wajib diisi").max(200),
  accountId: optionalId,
  notes: optionalString(500),
  attachmentIds: optionalString(2000),
})

// ==================== SALES RETURN ====================

export const createSalesReturnSchema = z.object({
  customerId: requiredId,
  salesInvoiceId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  reason: optionalString(500),
  items: z.string().min(1, "Items wajib diisi").max(50000),
})

export const updateSalesReturnSchema = z.object({
  customerId: requiredId,
  salesInvoiceId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  reason: optionalString(500),
  items: z.string().min(1, "Items wajib diisi").max(50000),
})

// ==================== DELIVERY ORDER ====================

export const createDeliveryOrderSchema = z.object({
  salesOrderId: requiredId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  deliveryDate: optionalString(50),
  doNumber: optionalString(200),
  shippingAddress: optionalString(500),
  shippingProvince: optionalString(200),
  shippingCity: optionalString(200),
  shippingDistrict: optionalString(200),
  shippingVillage: optionalString(200),
  shippingPostalCode: optionalString(20),
  shippingPhone: optionalString(30),
  vehicleNumber: optionalString(200),
  notes: optionalString(500),
})

export const updateDeliveryOrderSchema = z.object({
  salesOrderId: requiredId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  deliveryDate: optionalString(50),
  doNumber: optionalString(200),
  shippingAddress: optionalString(500),
  shippingProvince: optionalString(200),
  shippingCity: optionalString(200),
  shippingDistrict: optionalString(200),
  shippingVillage: optionalString(200),
  shippingPostalCode: optionalString(20),
  shippingPhone: optionalString(30),
  vehicleNumber: optionalString(200),
  notes: optionalString(500),
})
