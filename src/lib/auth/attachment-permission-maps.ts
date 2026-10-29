/**
 * Permission maps for transaction attachments.
 *
 * This module is INTENTIONALLY dependency-free. The client component
 * `src/components/ui/transaction-attachments.tsx` reads ATTACHMENT_WRITE_PERMISSION
 * to decide whether to render upload/delete affordances; importing it from
 * `./attachment-permissions` pulled `@/lib/db/prisma` (and therefore the MariaDB
 * driver, which requires fs/net/tls) into the browser bundle and broke
 * `next build` with "Module not found: Can't resolve 'fs'".
 *
 * Keep this file free of any RUNTIME import (type-only imports are erased
 * at compile time and never reach the browser bundle).
 */
import type { PermissionName } from "@/lib/setup/base-data";

export const ATTACHMENT_PERMISSION: Record<string, PermissionName> = {
  sales_invoice: "view_sales_invoices",
  sales_order: "view_sales_orders",
  quotation: "view_quotations",
  purchase_order: "view_purchase_orders",
  vendor_bill: "view_vendor_bills",
  vendor_payment: "view_vendor_payments",
  sales_payment: "view_sales_payments",
  down_payment: "view_down_payments",
  journal: "view_journals",
  expense: "view_expenses",
  material_issue: "view_material_issues",
  work_order: "view_work_orders",
  project: "view_projects",
  goods_receipt: "view_goods_receipts",
  purchase_return: "view_purchase_returns",
  sales_return: "view_sales_returns",
  bank_statement: "view_bank_statements",
  delivery_order: "view_delivery_orders",
  inventory_transfer: "view_inventory_transfers",
  stock_adjustment: "view_stock_adjustments",
  petty_cash: "view_petty_cash",
  WarrantyClaim: "view_warranty_claims",
  EmployeeDisciplinaryRecord: "view_disciplinary_records",
  // F-2026-10-27-113-S BR-TXD-09 (putusan Lead Q-TXD-8 PR #1407): lampiran
  // dokumen sengketa pajak memakai referenceType polimorfik existing.
  tax_assessment: "view_tax_disputes",
  tax_dispute_step: "view_tax_disputes",
}

export const ATTACHMENT_WRITE_PERMISSION: Record<string, PermissionName> = {
  sales_invoice: "edit_sales_invoices",
  sales_order: "edit_sales_orders",
  quotation: "edit_quotations",
  purchase_order: "edit_purchase_orders",
  vendor_bill: "edit_vendor_bills",
  vendor_payment: "edit_vendor_payments",
  sales_payment: "edit_sales_payments",
  down_payment: "edit_down_payments",
  journal: "create_journals",
  expense: "edit_expenses",
  material_issue: "edit_material_issues",
  work_order: "edit_work_orders",
  project: "edit_projects",
  goods_receipt: "edit_goods_receipts",
  purchase_return: "edit_purchase_returns",
  sales_return: "edit_sales_returns",
  // Rekening koran tak punya halaman ubah; satu-satunya penulisnya adalah
  // createBankStatement yang memakai create_journals. "edit_bank_statements"
  // tidak pernah di-seed sehingga unggah/hapus lampiran tak muncul untuk siapa pun.
  bank_statement: "create_journals",
  delivery_order: "edit_delivery_orders",
  inventory_transfer: "edit_inventory_transfers",
  stock_adjustment: "edit_stock_adjustments",
  petty_cash: "edit_petty_cash",
  WarrantyClaim: "edit_warranty_claims",
  // F-2026-10-25-005-S DISC-B1: bukti pelanggaran rekod disiplin (spec §3).
  EmployeeDisciplinaryRecord: "create_disciplinary_records",
  // F-2026-10-27-113-S BR-TXD-09 (putusan Lead Q-TXD-8 PR #1407): unggah
  // bukti ketetapan/upaya memakai izin tulis sengketa.
  tax_assessment: "create_tax_disputes",
  tax_dispute_step: "create_tax_disputes",
}

export const ATTACHMENT_CREATE_PERMISSION: Record<string, PermissionName> = {
  journal: "create_journals",
  expense: "create_expenses",
  sales_payment: "create_sales_payments",
  vendor_bill: "create_vendor_bills",
  petty_cash: "create_petty_cash",
}

// F-2026-10-24-096-S: foto tahap/inspeksi. QC digerbang izin QC persis
// (§3 spec), bukan izin WO generik; tahap proyek/operasi WO mengikuti
// induk proyek/WO-nya; kendaraan mengikuti izin pelanggan.
const PHOTO_PARENT_PERMISSIONS: [string, PermissionName, PermissionName][] = [
  ["customer_vehicle", "view_customers", "edit_customers"],
  ["project_stage", "view_projects", "edit_projects"],
  ["work_order_operation", "view_work_orders", "edit_work_orders"],
  ["qc_inspection", "view_qc", "manage_qc_inspections"],
]
for (const [type, view, write] of PHOTO_PARENT_PERMISSIONS) {
  ATTACHMENT_PERMISSION[type] = view
  ATTACHMENT_WRITE_PERMISSION[type] = write
}
