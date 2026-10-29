/**
 * Kontrak route lampiran bersama POST/GET (satu sumber — sebelumnya daftar
 * whitelist + select ditulis dua kali dan memicu duplikasi Sonar).
 * Dipakai src/app/api/upload/attachments/route.ts.
 */
export const ATTACHMENT_REFERENCE_TYPES = [
  "sales_invoice", "sales_order", "quotation", "purchase_order",
  "vendor_bill", "vendor_payment", "sales_payment", "down_payment",
  "journal", "expense", "material_issue", "work_order", "project",
  "goods_receipt", "purchase_return", "sales_return", "bank_statement",
  "delivery_order", "inventory_transfer", "stock_adjustment", "petty_cash", "WarrantyClaim",
  // F-2026-10-24-096-S: induk foto tahap/inspeksi (BR-PHOTO-01).
  "customer_vehicle", "project_stage", "work_order_operation", "qc_inspection",
  // Sengketa pajak 113-B: lampiran ketetapan + upaya (maps izin create/view ada).
  "tax_assessment", "tax_dispute_step",
] as const

/** Field kontrak POST/GET: tanpa select, kolom internal ikut bocor. */
export const ATTACHMENT_RESPONSE_SELECT = {
  id: true,
  filename: true,
  originalName: true,
  fileUrl: true,
  fileSize: true,
  mimeType: true,
  photoCategory: true,
  verifiedBy: true,
  verifiedAt: true,
  publishedBy: true,
  publishedAt: true,
  createdAt: true,
} as const
