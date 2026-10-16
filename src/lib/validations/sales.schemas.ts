import { z } from "zod";

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

const requiredId = z.coerce.number().int().min(1, "ID wajib diisi");
const optionalId = z.coerce.number().int().min(1).optional();

// ==================== QUOTATION ====================

export const updateQuotationSchema = z.object({
  customerId: optionalId,
  customerVehicleId: optionalId,
  date: optionalString(50),
  validUntil: optionalString(50),
  paymentMethod: optionalString(200),
  shippingMethod: optionalString(200),
  notes: optionalString(500),
});

// ==================== DOWN PAYMENT ====================

export const createDownPaymentSchema = z.object({
  quotationId: requiredId,
  amount: z.coerce.number().min(1, "Jumlah uang muka harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal pembayaran wajib diisi").max(50),
  paymentMethod: optionalString(200),
  notes: optionalString(500),
});

export const updateDownPaymentSchema = z.object({
  quotationId: requiredId,
  amount: z.coerce.number().min(1, "Jumlah uang muka harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal pembayaran wajib diisi").max(50),
  paymentMethod: optionalString(200),
  notes: optionalString(500),
});

// ==================== SALES ORDER ====================

export const createSalesOrderSchema = z.object({
  customerId: requiredId,
  quotationId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  deliveryDate: optionalString(50),
  notes: optionalString(500),
});

export const updateSalesOrderSchema = z.object({
  customerId: requiredId,
  quotationId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  deliveryDate: optionalString(50),
  notes: optionalString(500),
  // Line items may be edited until a real settlement exists (custom
  // fabrication). Sent as a JSON string like the invoice editor. Per-line values
  // are clamped in the action, so no bounds here (mirrors updateSalesInvoice).
  items: optionalString(50000),
  taxRate: z.coerce.number().optional(),
  discount: z.coerce.number().optional(),
});

// ==================== SALES INVOICE ====================

export const createSalesInvoiceSchema = z.object({
  customerId: requiredId,
  salesOrderId: optionalId,
  quotationId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  dueDate: optionalString(50),
  notes: optionalString(500),
});

export const updateSalesInvoiceSchema = z.object({
  customerId: requiredId,
  salesOrderId: optionalId,
  quotationId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  dueDate: optionalString(50),
  // Notes round-trip: the invoice form renders a notes textarea but the
  // schema didn't accept the field, so the value was stripped before
  // reaching the action's data block.
  notes: optionalString(500),
  items: optionalString(50000),
  // taxRate/discount are intentionally NOT min(0)-bounded at the schema layer:
  // updateSalesInvoice already clamps a negative taxRate to 0 and a discount
  // to [0, subtotal] in-action (see update-invoice-negative-tax regression
  // test). Clamping is the established behaviour — a hard schema rejection
  // would change the contract from "silently corrected" to "save blocked".
  taxRate: z.coerce.number().optional(),
  discount: z.coerce.number().optional(),
});

// ==================== SALES PAYMENT ====================

export const createSalesPaymentSchema = z.object({
  salesInvoiceId: requiredId,
  amount: z.coerce.number().min(1, "Jumlah pembayaran harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal pembayaran wajib diisi").max(50),
  paymentMethod: z.string().min(1, "Metode pembayaran wajib diisi").max(200),
  accountId: optionalId,
  // PPh yang dipotong pelanggan (opsional) — `amount` di atas tetap berarti kas
  // yang diterima. Batas "amount + potongan tidak boleh melebihi sisa tagihan"
  // diperiksa di action, karena hanya di sana sisa tagihannya diketahui.
  withholdingTypeId: optionalId,
  withholdingAmount: z.coerce.number().min(0, "Potongan PPh tidak boleh negatif").optional(),
  withholdingCertificateNo: optionalString(100),
  withholdingDate: optionalString(50),
  referenceNo: optionalString(100),
  notes: optionalString(500),
  attachmentIds: optionalString(2000),
});

export const updateSalesPaymentSchema = z.object({
  salesInvoiceId: requiredId,
  amount: z.coerce.number().min(1, "Jumlah pembayaran harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal pembayaran wajib diisi").max(50),
  paymentMethod: z.string().min(1, "Metode pembayaran wajib diisi").max(200),
  accountId: optionalId,
  withholdingTypeId: optionalId,
  withholdingAmount: z.coerce.number().min(0, "Potongan PPh tidak boleh negatif").optional(),
  withholdingCertificateNo: optionalString(100),
  withholdingDate: optionalString(50),
  referenceNo: optionalString(100),
  notes: optionalString(500),
  attachmentIds: optionalString(2000),
});

// ==================== SALES RETURN ====================

export const createSalesReturnSchema = z.object({
  customerId: requiredId,
  salesInvoiceId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  reason: optionalString(500),
  items: z.string().min(1, "Items wajib diisi").max(50000),
});

export const updateSalesReturnSchema = z.object({
  customerId: requiredId,
  salesInvoiceId: optionalId,
  date: z.string().min(1, "Tanggal wajib diisi").max(50),
  reason: optionalString(500),
  items: z.string().min(1, "Items wajib diisi").max(50000),
});

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
});

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
});

// ==================== PENAWARAN (form) ====================
export const quotationItemSchema = z.object({
  itemId: z.number().nullable().optional(),
  isCustom: z.boolean().optional().default(false),
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
  paymentMethod: z.string().optional(),
  shippingMethod: z.string().optional(),
  notes: z.string().optional(),
  sections: z.array(quotationSectionSchema).min(1, "Minimal 1 section"),
})

export type QuotationInput = z.infer<typeof quotationSchema>
export type SalesPaymentInput = z.infer<typeof createSalesPaymentSchema>
