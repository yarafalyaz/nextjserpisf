/** Document types that can be routed through an approval workflow. */
export const APPROVAL_MODEL_TYPES = ["PurchaseOrder", "Expense", "LeaveRequest", "OvertimeRequest", "EmployeeLoan", "PurchaseRequest", "SalesInvoice", "Payroll", "Project"] as const

export type ApprovalModelType = (typeof APPROVAL_MODEL_TYPES)[number]

/** Human-readable label for each model type in Indonesian. */
export const APPROVAL_MODEL_LABELS: Record<string, string> = {
  PurchaseOrder: "Pesanan Pembelian",
  Expense: "Pengeluaran",
  LeaveRequest: "Cuti",
  OvertimeRequest: "Lembur",
  EmployeeLoan: "Pinjaman Karyawan",
  PurchaseRequest: "Permintaan Pembelian",
  SalesInvoice: "Faktur Penjualan",
  Payroll: "Penggajian",
  Project: "Proyek",
}
