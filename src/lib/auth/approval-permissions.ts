/**
 * Single source of truth: which permission guards approve/reject for each
 * approval reference type (Prisma model name).
 *
 * Before this module existed the mapping was duplicated — once in
 * `approval.actions.ts` (used by approveStep/rejectStep, i.e. the detail-page
 * flow) and once in `src/app/api/workflow/[...path]/route.ts` (used by the
 * status-change buttons). Two copies drift: the record type map guarded
 * EmployeeLoan with `create_loans` in both places, so anyone who could raise a
 * loan could also approve and disburse it (self-approval, no separation of
 * duties). Consolidating means a future change lands in exactly one place.
 *
 * Keep every value in sync with prisma/seed.ts — the permission string must
 * exist as a seeded permission or non-super_admin roles fail-closed.
 */
export const APPROVAL_REFERENCE_PERMISSIONS: Record<string, string> = {
  Quotation: "approve_quotations",
  SalesOrder: "approve_sales_orders",
  SalesInvoice: "approve_sales_invoices",
  PurchaseRequest: "approve_purchase_requests",
  PurchaseOrder: "approve_purchase_orders",
  VendorBill: "approve_vendor_bills",
  LeaveRequest: "approve_leave_requests",
  OvertimeRequest: "approve_overtime_requests",
  EmployeeLoan: "approve_loans",
  Expense: "approve_expenses",
}
