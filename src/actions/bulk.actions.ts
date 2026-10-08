
"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"

type ModelName =
  | "purchaseRequest"
  | "purchaseOrder"
  | "goodsReceipt"
  | "vendorBill"
  | "vendorPayment"
  | "purchaseReturn"
  | "salesQuotation"
  | "salesOrder"
  | "deliveryOrder"
  | "salesInvoice"
  | "salesPayment"
  | "salesReturn"
  | "downPayment"
  | "customer"
  | "vendor"
  | "item"
  | "itemCategory"
  | "brand"
  | "warehouse"
  | "employee"
  | "department"
  | "position"
  | "bank"
  | "tax"
  | "currency"
  | "paymentTerm"
  | "journal"
  | "expense"
  | "expenseCategory"
  | "pettyCash"
  | "budget"
  | "costCenter"
  | "statisticalKeyFigure"
  | "leave"
  | "overtime"
  | "holiday"
  | "loan"
  | "timesheet"
  | "workSchedule"
  | "stockAdjustment"
  | "stockTransfer"
  | "materialIssue"
  | "rack"
  | "rackRow"
  | "productionOrder"
  | "workOrder"
  | "product"
  | "project"
  | "assetBrand"
  | "assetCategory"
  | "asset"
  | "assetTransfer"
  | "vehicleBrand"
  | "vehicleModel"
  | "vehicleFitmentRule"
  | "vehicle"
  | "appreciation"
  | "departmentHoliday"
  | "paymentMethod"
  | "shippingMethod"
  | "lead"
  | "approval"

const modelPermissionMap: Record<ModelName, string> = {
  purchaseRequest: "delete_purchase_requests",
  purchaseOrder: "delete_purchase_orders",
  goodsReceipt: "delete_goods_receipts",
  vendorBill: "delete_vendor_bills",
  vendorPayment: "delete_vendor_payments",
  purchaseReturn: "delete_purchase_returns",
  salesQuotation: "delete_quotations",
  salesOrder: "delete_sales_orders",
  deliveryOrder: "delete_delivery_orders",
  salesInvoice: "delete_sales_invoices",
  salesPayment: "delete_sales_payments",
  salesReturn: "delete_sales_returns",
  downPayment: "delete_down_payments",
  customer: "delete_customers",
  vendor: "delete_vendors",
  item: "delete_items",
  itemCategory: "delete_item_categories",
  brand: "delete_brands",
  warehouse: "delete_warehouses",
  employee: "delete_employees",
  department: "delete_departments",
  position: "delete_positions",
  bank: "delete_banks",
  tax: "delete_taxes",
  currency: "delete_currencies",
  paymentTerm: "delete_payment_terms",
  journal: "delete_journals",
  expense: "delete_expenses",
  expenseCategory: "manage_expense_categories",
  pettyCash: "delete_petty_cash",
  budget: "delete_budgets",
  costCenter: "delete_cost_centers",
  statisticalKeyFigure: "delete_statistical_key_figures",
  leave: "delete_leave_requests",
  overtime: "delete_overtime_requests",
  holiday: "delete_holidays",
  loan: "delete_loans",
  timesheet: "delete_timesheets",
  workSchedule: "delete_work_schedules",
  stockAdjustment: "delete_stock_adjustments",
  stockTransfer: "delete_inventory_transfers",
  materialIssue: "delete_material_issues",
  rack: "delete_warehouses",
  rackRow: "manage_inventory",
  productionOrder: "delete_production_orders",
  workOrder: "delete_work_orders",
  product: "delete_products",
  project: "delete_projects",
  assetBrand: "delete_asset_brands",
  assetCategory: "delete_asset_categories",
  asset: "delete_assets",
  assetTransfer: "delete_asset_transfers",
  vehicleBrand: "delete_vehicle_brands",
  vehicleModel: "delete_vehicle_models",
  vehicleFitmentRule: "delete_vehicle_fitments",
  vehicle: "delete_vehicles",
  appreciation: "delete_appreciations",
  departmentHoliday: "delete_holidays",
  paymentMethod: "delete_payment_methods",
  shippingMethod: "delete_shipping_methods",
  lead: "delete_leads",
  approval: "approve_workflows",
}

// Route to revalidate after a successful bulk delete. `null` means there is no
// live page for that model (the module was removed from the app), so there is
// nothing to revalidate — see the nulls at the end of the map.
const modelRevalidateMap: Record<ModelName, string | null> = {
  purchaseRequest: "/pembelian/permintaan",
  purchaseOrder: "/pembelian/pesanan",
  goodsReceipt: "/pembelian/penerimaan",
  vendorBill: "/pembelian/tagihan",
  vendorPayment: "/pembelian/pembayaran-vendor",
  purchaseReturn: "/pembelian/retur",
  salesQuotation: "/penjualan/penawaran",
  salesOrder: "/penjualan/pesanan",
  deliveryOrder: "/penjualan/surat-jalan",
  salesInvoice: "/penjualan/faktur",
  salesPayment: "/penjualan/pembayaran",
  salesReturn: "/penjualan/retur",
  downPayment: "/penjualan/uang-muka",
  customer: "/master/pelanggan",
  vendor: "/master/pemasok",
  item: "/master/barang",
  itemCategory: "/master/kategori-barang",
  brand: "/master/merek",
  warehouse: "/master/gudang",
  employee: "/master/karyawan",
  department: "/master/departemen",
  position: "/master/jabatan",
  bank: "/master/bank",
  tax: "/master/pajak",
  paymentTerm: "/master/syarat-pembayaran",
  journal: "/keuangan/jurnal",
  expense: "/keuangan/pengeluaran",
  expenseCategory: "/master/kategori-pengeluaran",
  pettyCash: "/keuangan/kas-kecil",
  budget: "/keuangan/anggaran",
  costCenter: "/keuangan/pusat-biaya",
  statisticalKeyFigure: "/keuangan/angka-kunci-statistik",
  leave: "/sdm/cuti",
  overtime: "/sdm/lembur",
  loan: "/sdm/pinjaman",
  timesheet: "/sdm/lembar-waktu",
  stockAdjustment: "/inventaris/penyesuaian",
  stockTransfer: "/inventaris/transfer",
  materialIssue: "/inventaris/pengeluaran-material",
  rack: "/inventaris/rak",
  rackRow: "/inventaris/baris-rak",
  productionOrder: "/produksi/production-orders",
  workOrder: "/produksi/perintah-kerja",
  product: "/produksi/products",
  project: "/proyek",
  assetBrand: "/aset/merek",
  assetCategory: "/aset/kategori",
  asset: "/aset",
  assetTransfer: "/aset/transfer",
  vehicleBrand: "/kendaraan/merek",
  vehicleModel: "/kendaraan/model",
  vehicleFitmentRule: "/kendaraan/fitment",
  vehicle: "/kendaraan",
  appreciation: "/sdm/apresiasi",
  paymentMethod: "/master/metode-pembayaran",
  shippingMethod: "/master/metode-pengiriman",
  lead: "/crm/leads",
  approval: "/pengaturan/persetujuan",
  // Modules removed from the app: their pages no longer exist, so there is no
  // route to revalidate. Explicit nulls (instead of stale paths like
  // "/master/mata-uang") so the map stays exhaustive over ModelName and nothing
  // silently revalidates a route that is not served any more.
  currency: null,
  holiday: null,
  workSchedule: null,
  departmentHoliday: null,
}

const dmmfModelMap = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name.charAt(0).toLowerCase() + model.name.slice(1),
    model,
  ])
)

// Some model aliases don't match the Prisma client property name
const prismaModelAlias: Record<string, string> = {
  salesQuotation: "quotation",
  stockTransfer: "inventoryTransfer",
  leave: "leaveRequest",
  overtime: "overtimeRequest",
  loan: "employeeLoan",
}

const BULK_DELETE_MAX = 500

/**
 * Models with financial (GL journal) or stock (FIFO/qtyOnHand) side effects, or
 * a status guard on their single-delete path. Raw bulkDelete bypasses both the
 * per-entity reversal hooks (orphaning GL journals / corrupting stock) AND the
 * status guards that forbid deleting posted/confirmed records. These MUST be
 * deleted one-by-one through their dedicated server actions, which reverse the
 * journal, recompute running balances, undo stock moves, and refuse to delete
 * already-posted records. Pure master/config models are not listed and remain
 * safe for raw bulk delete.
 */
const BULK_DELETE_REQUIRES_INDIVIDUAL = new Set<ModelName>([
  // Sales / purchasing — reverse downstream documents and honor state guards
  "salesOrder",
  "purchaseRequest",
  "purchaseOrder",
  // Finance — post GL journals
  "pettyCash",
  "expense",
  "journal",
  "salesPayment",
  "vendorPayment",
  "salesInvoice",
  "vendorBill",
  "downPayment",
  "salesReturn",
  "purchaseReturn",
  // Inventory / stock — post stock moves + FIFO layers
  "goodsReceipt",
  "materialIssue",
  "stockAdjustment",
  "stockTransfer",
  "deliveryOrder",
  // Manufacturing / payroll — downstream side effects
  "productionOrder",
  "workOrder",
  "project",
  "loan",
  // HR records — preserve employee scope, approval cleanup, and status guards
  "leave",
  "overtime",
  "timesheet",
  // Rack deletion has a reference guard to preserve item and stock locations
  "rack",
  "rackRow",
  // Fixed assets and vehicles — have GL or dependent records guards
  "asset",
  "vehicle",
])

export async function bulkDelete(model: ModelName, ids: number[]) {
  const safeIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)))
  if (!safeIds.length) return { success: false, message: "Tidak ada data valid yang dipilih" }
  if (safeIds.length > BULK_DELETE_MAX) {
    return { success: false, message: `Maksimal ${BULK_DELETE_MAX} data per sekali hapus` }
  }

  // Authorization FIRST, before any other validation. The model name in a
  // server action is a string from the wire and the `ModelName` union is
  // compile-time only — a caller can submit any string. Look up the
  // permission key up front so an unauthenticated/anonymous probe never
  // reaches the dmmf dispatch logic. (Previously the requirePermission call
  // sat below the validation guards, which let anonymous callers still
  // exercise the model existence checks.)
  const permission = modelPermissionMap[model]
  if (!permission) {
    return { success: false, message: "Operasi hapus tidak diizinkan untuk model ini" }
  }
  await requirePermission(permission)

  // Integrity guard: refuse raw bulk delete for models with GL/stock side
  // effects or a status guard. Raw deleteMany here would bypass the reversal
  // hooks (leaving orphaned journals / corrupted stock) and the status guard
  // (allowing deletion of posted/confirmed records). Route the user to the
  // per-row delete action, which handles reversal + guards correctly.
  if (BULK_DELETE_REQUIRES_INDIVIDUAL.has(model)) {
    return {
      success: false,
      message:
        "Data ini harus dihapus satu per satu agar pemeriksaan status, cakupan akses, " +
        "dan pembaruan data terkait tetap dijalankan.",
    }
  }

  try {
     
    // Intentional dynamic dispatch — model validated against ALLOWED_MODELS
    const modelName = prismaModelAlias[model] || model
    const prismaModel = (prisma as any)[modelName]
    if (!prismaModel) {
      return { success: false, message: `Model ${model} tidak ditemukan` }
    }

    const schemaModel = dmmfModelMap.get(modelName)
    if (!schemaModel) {
      return { success: false, message: `Skema model ${model} tidak ditemukan` }
    }

    const hasSoftDelete = schemaModel.fields.some((field) => field.name === "deletedAt")
    // A soft-deleted row must also be deactivated: pickers and lists widely filter
    // by `isActive` alone, so leaving isActive=true kept the "deleted" master
    // selectable for new documents and visible in lists.
    const hasIsActive = schemaModel.fields.some((field) => field.name === "isActive")

    // Lead — hard delete (cascade ke aktivitas otomatis via Prisma)
    if (model === "lead") {
      await prismaModel.deleteMany({ where: { id: { in: safeIds } } })
    } else if (hasSoftDelete) {
      await prismaModel.updateMany({
        where: { id: { in: safeIds } },
        data: { deletedAt: new Date(), ...(hasIsActive ? { isActive: false } : {}) },
      })
    } else {
      await prismaModel.deleteMany({
        where: { id: { in: safeIds } },
      })
    }

    const path = modelRevalidateMap[model]
    if (path) {
      revalidatePath(path)
    }

    return { success: true, message: `${safeIds.length} data berhasil dihapus` }
  } catch (error) {
    console.error("[bulkDelete]", error)
    return { success: false, message: "Gagal menghapus data. Mungkin ada relasi yang terkait." }
  }
}
