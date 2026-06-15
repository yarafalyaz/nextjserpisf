/* eslint-disable @typescript-eslint/no-explicit-any */
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
  | "vehicle"
  | "appreciation"
  | "departmentHoliday"
  | "paymentMethod"
  | "shippingMethod"

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
  salesInvoice: "delete_invoices",
  salesPayment: "delete_payments",
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
  pettyCash: "delete_petty_cash",
  budget: "delete_budgets",
  costCenter: "delete_cost_centers",
  statisticalKeyFigure: "delete_statistical_key_figures",
  leave: "delete_leave",
  overtime: "delete_overtime",
  holiday: "delete_holidays",
  loan: "delete_loans",
  timesheet: "delete_timesheets",
  workSchedule: "delete_work_schedules",
  stockAdjustment: "delete_adjustments",
  stockTransfer: "delete_transfers",
  materialIssue: "delete_material_issues",
  rack: "delete_racks",
  rackRow: "manage_inventory",
  productionOrder: "delete_production_orders",
  workOrder: "delete_work_orders",
  product: "delete_bom_products",
  project: "delete_projects",
  assetBrand: "delete_asset_brands",
  assetCategory: "delete_asset_categories",
  asset: "delete_assets",
  assetTransfer: "delete_asset_transfers",
  vehicleBrand: "delete_vehicle_brands",
  vehicleModel: "delete_vehicle_models",
  vehicle: "delete_vehicles",
  appreciation: "delete_appreciations",
  departmentHoliday: "delete_holidays",
  paymentMethod: "delete_payment_methods",
  shippingMethod: "delete_shipping_methods",
}

const modelRevalidateMap: Record<ModelName, string> = {
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
  currency: "/master/mata-uang",
  paymentTerm: "/master/syarat-pembayaran",
  journal: "/keuangan/jurnal",
  expense: "/keuangan/pengeluaran",
  pettyCash: "/keuangan/kas-kecil",
  budget: "/keuangan/anggaran",
  costCenter: "/keuangan/pusat-biaya",
  statisticalKeyFigure: "/keuangan/angka-kunci-statistik",
  leave: "/sdm/cuti",
  overtime: "/sdm/lembur",
  holiday: "/sdm/hari-libur",
  loan: "/sdm/pinjaman",
  timesheet: "/sdm/lembar-waktu",
  workSchedule: "/sdm/jadwal-kerja",
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
  vehicle: "/kendaraan",
  appreciation: "/sdm/apresiasi",
  departmentHoliday: "/sdm/hari-libur-departemen",
  paymentMethod: "/master/metode-pembayaran",
  shippingMethod: "/master/metode-pengiriman",
}

const dmmfModelMap = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name.charAt(0).toLowerCase() + model.name.slice(1),
    model,
  ])
)

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
  "loan",
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

  // Authorization allowlist: the model MUST be a known key with a delete
  // permission. A server action is a network endpoint, so the compile-time
  // `ModelName` union is NOT enforced at runtime — without this guard a caller
  // could pass an unmapped model (e.g. "user", "role") and skip the permission
  // check entirely. Reject anything not explicitly mapped.
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
        "Data ini punya dampak akuntansi/stok dan harus dihapus satu per satu " +
        "agar jurnal & saldo terkait ikut dibatalkan dengan benar.",
    }
  }

  try {
     
    // Intentional dynamic dispatch — model validated against ALLOWED_MODELS
    const prismaModel = (prisma as any)[model]
    if (!prismaModel) {
      return { success: false, message: `Model ${model} tidak ditemukan` }
    }

    const schemaModel = dmmfModelMap.get(model)
    if (!schemaModel) {
      return { success: false, message: `Skema model ${model} tidak ditemukan` }
    }

    const hasSoftDelete = schemaModel.fields.some((field) => field.name === "deletedAt")

    if (hasSoftDelete) {
      await prismaModel.updateMany({
        where: { id: { in: safeIds } },
        data: { deletedAt: new Date() },
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
