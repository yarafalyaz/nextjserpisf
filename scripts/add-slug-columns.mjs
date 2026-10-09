/**
 * One-off codemod: add `slug String @unique` to every model that has a routed
 * `[id]` page, so the app can address records by a human-readable slug.
 *
 * Idempotent: skips models that already declare `slug`.
 *
 * Usage: node scripts/add-slug-columns.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"

const SCHEMA = new URL("../prisma/schema.prisma", import.meta.url)

// Models that back a dynamic `[id]` route somewhere under src/app.
// Order does not matter.
const TARGET_MODELS = [
  // master
  "Account", "Bank", "Barcode", "Department", "Warehouse", "Position",
  "Employee", "ItemCategory", "CustomerCategory", "ExpenseCategory",
  "TaxGroup", "Brand", "PaymentMethod", "ShippingMethod", "Tax", "Customer",
  "UnitOfMeasure", "PaymentTerm", "Vendor",
  // aset
  "AssetCategory", "AssetBrand", "Asset", "AssetTransfer",
  // kendaraan
  "VehicleBrand", "VehicleModel", "Vehicle", "VehicleFitmentRule",
  // proyek
  "Project", "Task",
  // produksi
  "Product", "BomRevision", "WorkOrder", "ProductionOrder", "QcChecklist",
  "QcInspection", "Nonconformance",
  // keuangan
  "Budget", "StatisticalKeyFigure", "Journal", "PettyCash", "BankStatement",
  "Expense", "CostCenter", "BankReconciliation", "AllocationRule",
  "ApprovalWorkflow", "Approval",
  // inventaris
  "RackRow", "StockMove", "MaterialIssue", "StockAdjustment", "Rack",
  "InventoryTransfer",
  // penjualan
  "SalesInvoice", "SalesPayment", "Quotation", "SalesOrder", "SalesReturn",
  "DeliveryOrder", "DownPayment",
  // pembelian
  "VendorPayment", "GoodsReceipt", "PurchaseRequest", "PurchaseOrder",
  "PurchaseReturn", "VendorBill",
  // sdm
  "Appreciation", "LeaveRequest", "Timesheet", "OvertimeRequest", "Payroll",
  "EmployeeLoan",
  // crm
  "Lead", "CrmTicket",
  // pengaturan
  "Role",
]

const src = readFileSync(SCHEMA, "utf8")
const lines = src.split("\n")

const out = []
let currentModel = null
let insertedForCurrent = false
let insertedCount = 0

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i]
  const modelMatch = line.match(/^model\s+(\w+)\s*\{/)
  if (modelMatch) {
    currentModel = modelMatch[1]
    insertedForCurrent = false
    out.push(line)
    // Insert slug right after the opening brace: keep it near the top so it
    // reads alongside `id`/`name`.
    if (
      TARGET_MODELS.includes(currentModel) &&
      !src.split(`model ${currentModel} {`)[1]?.split("}")[0]?.includes("slug")
    ) {
      out.push("  slug String? @unique")
      insertedForCurrent = true
      insertedCount += 1
    }
    continue
  }
  out.push(line)
}

writeFileSync(SCHEMA, out.join("\n"))
console.log(`Inserted slug into ${insertedCount} models.`)
