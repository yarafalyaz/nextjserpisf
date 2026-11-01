import type { PermissionName } from "@/lib/setup/base-data"

/**
 * Kontrak hapus massal generik (`bulkDelete`) — dipakai server
 * (`src/actions/bulk.actions.ts`) dan client (tabel + DataTable) supaya
 * keduanya membaca SATU daftar. Tanpa daftar bersama ini, tabel berhak
 * menawarkan "Hapus Terpilih" untuk model yang server selalu menolak, dan
 * pengguna hanya menemukan penolakannya sesudah mengklik.
 *
 * Model yang punya efek jurnal GL/stok atau guard status pada delete per
 * baris WAJIB dihapus satu per satu lewat action khususnya
 * (`BULK_DELETE_REQUIRES_INDIVIDUAL`): delete massal mentah akan melompati
 * reversal hook (meninggalkan jurnal yatim / merusak stok) dan guard status
 * (membolehkan hapus dokumen terposting). Master/konfigurasi murni tidak
 * masuk daftar dan tetap aman untuk hapus massal.
 */
export type BulkDeleteModel =
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
  | "itemGroup"
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
  | "costCenter"
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

/** Permission yang dituntut server `bulkDelete` per model. */
export const BULK_DELETE_PERMISSIONS: Record<BulkDeleteModel, PermissionName> = {
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
  itemGroup: "delete_item_groups",
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
  costCenter: "delete_cost_centers",
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

/**
 * Model yang TIDAK boleh dihapus massal. Komentar per kelompok menjelaskan
 * guard/hook per baris yang akan dilompati delete mentah — pertahankan
 * alasannya saat menambah entri.
 */
export const BULK_DELETE_REQUIRES_INDIVIDUAL = new Set<BulkDeleteModel>([
  // Sales / purchasing — membalik dokumen turunan dan menghormati guard status
  "salesQuotation",
  "salesOrder",
  "purchaseRequest",
  "purchaseOrder",
  // Finance — memposting jurnal GL
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
  // Inventory / stock — memposting pergerakan stok + lapisan FIFO
  "goodsReceipt",
  "materialIssue",
  "stockAdjustment",
  "stockTransfer",
  "deliveryOrder",
  // Manufacturing / payroll — efek samping turunan
  "productionOrder",
  "workOrder",
  "project",
  "loan",
  // Produk: delete tunggal menolak selama dirujuk ProductionOrder/BOM/QC.
  // Product tanpa deletedAt → bulk deleteMany = hard delete + cascade
  // BomRevision diam-diam, melewati guard itu.
  "product",
  // Catatan SDM — menjaga cakupan karyawan, pembersihan approval, guard status
  "leave",
  "overtime",
  "timesheet",
  // WorkSchedule menolak hapus selama dipakai karyawan/departemen
  // (cascade M2M akan lepas jadwal yang dipakai absensi).
  "workSchedule",
  // Rack punya guard referensi lokasi item/stok
  "rack",
  "rackRow",
  // Item group punya guard referensi: items.group_id ON DELETE SET NULL,
  // delete mentah akan lepas semua item dari grupnya tanpa penolakan.
  "itemGroup",
  // Aset tetap dan kendaraan — guard jurnal GL / record dependen
  "asset",
  "vehicle",
  // Katalog kendaraan — guard merek/model menjaga tag kompatibilitas produk
  // dan junction ProductVehicleModel.
  "vehicleBrand",
  "vehicleModel",
  // Baris master/konfigurasi yang delete tunggalnya menolak selama masih
  // dirujuk (efek SET NULL / bare-Int / cascade). Delete massal mentah akan
  // lepas baris perujuk diam-diam alih-alih menolak.
  "assetBrand",
  "assetCategory",
  "assetTransfer",
  "bank",
  "brand",
  "costCenter",
  "department",
  "employee",
  "expenseCategory",
  "itemCategory",
  "paymentTerm",
  "position",
  "tax",
  // Metode bayar/kirim dirujuk dokumen lewat `code` string polos (tanpa FK):
  // delete tunggal menolak selama kode masih dipakai; delete massal mentah
  // memutus resolusi nama dokumen lama diam-diam.
  "paymentMethod",
  "shippingMethod",
  // Baris approval adalah status workflow, bukan master data: hapus massal
  // approval pending menghapus keputusan yang sedang berjalan tanpa guard.
  "approval",
  // Apresiasi karyawan terikat cakupan HR per karyawan: hapus massal mentah
  // melewati assertHrEmployeeAccess yang dijaga delete tunggal.
  "appreciation",
  // Lead beraktivitas wajib soft-delete agar histori LeadActivity tidak
  // musnah lewat cascade; delete tunggal (deleteLead) menerapkan aturan
  // itu per baris. Hapus massal mentah = hard delete + cascade senyap.
  "lead",
])
