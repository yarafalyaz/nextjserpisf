import { hasPermission } from "@/lib/auth/permissions"

// Maps a transaction-attachment referenceType to the view-permission required
// to access documents of that type. Used to gate attachment upload/list/serve
// so that being logged in is not sufficient — the caller must also be allowed
// to view the underlying document (mirrors PRINT_PERMISSION in print/route.ts).
// Closes the IDOR where any authenticated user could attach to / list / read
// attachments of any document by id.
export const ATTACHMENT_PERMISSION: Record<string, string> = {
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
}

/**
 * Returns true if the current session may access attachments for the given
 * referenceType. Unknown reference types are denied (fail-closed). super_admin
 * bypasses via hasPermission.
 */
export async function canAccessAttachment(referenceType: string): Promise<boolean> {
  const perm = ATTACHMENT_PERMISSION[referenceType]
  if (!perm) return false
  return hasPermission(perm)
}
