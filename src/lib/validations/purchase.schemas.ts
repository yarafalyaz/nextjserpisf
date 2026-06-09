import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNumber = (min?: number) => {
  const base = min !== undefined ? z.coerce.number().min(min) : z.coerce.number()
  return base.optional()
}

const dateString = z.string().min(1, "Tanggal wajib diisi")
const optionalDateString = optionalString(30)

// ==================== PURCHASE REQUEST ====================

export const purchaseRequestSchema = z.object({
  title: optionalString(200),
  requestedBy: optionalNumber(),
  date: dateString,
  requestDate: optionalDateString,
  description: optionalString(1000),
  notes: optionalString(1000),
  items: optionalString(10000), // JSON string, parsed separately
})

export type PurchaseRequestInput = z.infer<typeof purchaseRequestSchema>

// ==================== PURCHASE ORDER ====================

export const purchaseOrderSchema = z.object({
  vendorId: z.coerce.number().min(1, "Vendor wajib dipilih"),
  purchaseRequestId: optionalNumber(),
  date: dateString,
  expectedDate: optionalDateString,
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
})

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>

// ==================== GOODS RECEIPT ====================

export const goodsReceiptSchema = z.object({
  purchaseOrderId: z.coerce.number().min(1, "PO wajib dipilih"),
  warehouseId: z.coerce.number().min(1, "Gudang wajib dipilih"),
  date: dateString,
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
})

export type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>

// ==================== VENDOR BILL ====================

export const vendorBillSchema = z.object({
  vendorId: z.coerce.number().min(1, "Vendor wajib dipilih"),
  purchaseOrderId: optionalNumber(),
  date: dateString,
  dueDate: optionalDateString,
  vendorInvoiceNumber: optionalString(100),
  terms: optionalString(200),
  notes: optionalString(1000),
  subtotal: z.coerce.number().min(0, "Subtotal minimal 0").default(0),
  tax: z.coerce.number().min(0, "Pajak minimal 0").default(0),
  grandTotal: z.coerce.number().min(0, "Grand total minimal 0").default(0),
  attachmentIds: optionalString(5000), // JSON string
})

export type VendorBillInput = z.infer<typeof vendorBillSchema>

// ==================== VENDOR PAYMENT ====================

export const vendorPaymentSchema = z.object({
  vendorId: z.coerce.number().min(1, "Vendor wajib dipilih"),
  amount: z.coerce.number().min(1, "Jumlah pembayaran wajib diisi"),
  paymentDate: dateString,
  paymentMethod: z.string().min(1, "Metode pembayaran wajib diisi").max(50),
  accountId: optionalNumber(),
  notes: optionalString(1000),
  attachmentIds: optionalString(5000), // JSON string
})

export type VendorPaymentInput = z.infer<typeof vendorPaymentSchema>

// ==================== PURCHASE RETURN ====================

export const purchaseReturnSchema = z.object({
  purchaseOrderId: z.coerce.number().min(1, "PO wajib dipilih"),
  date: dateString,
  reason: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
})

export type PurchaseReturnInput = z.infer<typeof purchaseReturnSchema>
