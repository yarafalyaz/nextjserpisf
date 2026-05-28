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
}

const modelRevalidateMap: Record<ModelName, string> = {
  purchaseRequest: "/purchase/requests",
  purchaseOrder: "/purchase/orders",
  goodsReceipt: "/purchase/goods-receipts",
  vendorBill: "/purchase/bills",
  vendorPayment: "/purchase/vendor-payments",
  purchaseReturn: "/purchase/returns",
  salesQuotation: "/sales/quotations",
  salesOrder: "/sales/orders",
  deliveryOrder: "/sales/delivery-orders",
  salesInvoice: "/sales/invoices",
  salesPayment: "/sales/payments",
  salesReturn: "/sales/returns",
  downPayment: "/sales/down-payments",
  customer: "/master/customers",
  vendor: "/master/vendors",
  item: "/master/items",
  itemCategory: "/master/item-categories",
  brand: "/master/brands",
  warehouse: "/master/warehouses",
  employee: "/master/employees",
  department: "/master/departments",
  position: "/master/positions",
  bank: "/master/banks",
  tax: "/master/taxes",
  currency: "/master/currencies",
  paymentTerm: "/master/payment-terms",
  journal: "/finance/journals",
  expense: "/finance/expenses",
  pettyCash: "/finance/petty-cash",
  budget: "/finance/budgets",
  costCenter: "/finance/cost-centers",
  statisticalKeyFigure: "/finance/statistical-key-figures",
  leave: "/hrm/leave",
  overtime: "/hrm/overtime",
  holiday: "/hrm/holidays",
  loan: "/hrm/loans",
  timesheet: "/hrm/timesheets",
  workSchedule: "/hrm/work-schedules",
  stockAdjustment: "/inventory/adjustments",
  stockTransfer: "/inventory/transfers",
  materialIssue: "/inventory/material-issues",
  rack: "/inventory/racks",
  rackRow: "/inventory/rack-rows",
  productionOrder: "/manufacturing/production-orders",
  workOrder: "/manufacturing/work-orders",
  product: "/manufacturing/products",
  project: "/projects",
  assetBrand: "/assets/brands",
  assetCategory: "/assets/categories",
  asset: "/assets",
  assetTransfer: "/assets/transfers",
  vehicleBrand: "/vehicles/brands",
  vehicleModel: "/vehicles/models",
  vehicle: "/vehicles",
  appreciation: "/hrm/appreciations",
  departmentHoliday: "/hrm/department-holidays",
}

const dmmfModelMap = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name.charAt(0).toLowerCase() + model.name.slice(1),
    model,
  ])
)

const BULK_DELETE_MAX = 500

export async function bulkDelete(model: ModelName, ids: number[]) {
  const safeIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)))
  if (!safeIds.length) return { success: false, message: "Tidak ada data valid yang dipilih" }
  if (safeIds.length > BULK_DELETE_MAX) {
    return { success: false, message: `Maksimal ${BULK_DELETE_MAX} data per sekali hapus` }
  }

  const permission = modelPermissionMap[model]
  if (permission) {
    await requirePermission(permission)
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    console.error("Bulk delete error:", error)
    return { success: false, message: "Gagal menghapus data. Mungkin ada relasi yang terkait." }
  }
}
