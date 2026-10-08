/**
 * Single source of truth for all modules and their actions.
 *
 * Each entry maps a logical feature (Module) to a set of actions (view/create/
 * update/delete/approve/...). Each action has a `permissionKey` matching the
 * legacy `permissions` table so existing can() checks keep working unchanged.
 *
 * Used by:
 *   - prisma/seed-modules.ts  →  writes modules + module_actions rows
 *   - components/layout/sidebar.tsx  →  icon/route lookup
 *   - app/(dashboard)/pengaturan/peran/[id]/modul/page.tsx  →  checklist render
 *
 * Adding a new module? Add an entry here, then run `npx tsx prisma/seed-modules.ts`.
 */

import {
  LayoutDashboard, ClipboardList, Users, Factory, Package, Building2,
  UserCircle, BookOpen, DollarSign, FileText, Wallet, ShoppingCart,
  Receipt, CreditCard, RotateCcw, ShoppingBag, FileCheck, PackageCheck,
  Undo2, BarChart3, Scale, ArrowLeftRight, Wrench, Settings2, Hammer,
  Clock, Palmtree, Timer, Banknote, Landmark, BookOpenCheck, Coins,
  CircleDollarSign, Handshake, Target, Ticket, HardDrive, TrendingUp,
  Cog, Truck, FileSpreadsheet, Car, FolderKanban,
  CalendarDays, Briefcase, PiggyBank, ScanBarcode, Grid3X3, Tag,
  Globe, ListOrdered, Layers, BadgeDollarSign,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type ActionKey = "view" | "create" | "update" | "delete" | "approve"

export interface ModuleActionDef {
  key: ActionKey
  permissionKey: string
  label: string
}

export interface ModuleDef {
  key: string
  name: string
  parentKey?: string
  route?: string
  icon?: string
  order: number
  actions: ModuleActionDef[]
}

/** Build the full module tree mirroring src/components/layout/sidebar.tsx */
export const MODULES: ModuleDef[] = [
  {
    key: "dashboard",
    name: "Dasbor",
    route: "/",
    icon: "LayoutDashboard",
    order: 0,
    actions: [{ key: "view", permissionKey: "view_dashboard", label: "Lihat" }],
  },
  {
    key: "master",
    name: "Master Data",
    route: "/master",
    icon: "ClipboardList",
    order: 10,
    actions: [
      { key: "view", permissionKey: "view_customers", label: "Pelanggan" },
      { key: "view", permissionKey: "view_vendors", label: "Pemasok" },
      { key: "view", permissionKey: "view_items", label: "Barang" },
      { key: "view", permissionKey: "view_item_categories", label: "Kategori Barang" },
      { key: "view", permissionKey: "view_brands", label: "Merek" },
      { key: "view", permissionKey: "view_warehouses", label: "Gudang" },
      { key: "view", permissionKey: "view_employees", label: "Karyawan" },
      { key: "view", permissionKey: "view_departments", label: "Departemen" },
      { key: "view", permissionKey: "view_positions", label: "Jabatan" },
      { key: "view", permissionKey: "view_accounts", label: "Akun (COA)" },
      { key: "view", permissionKey: "view_banks", label: "Bank" },
      { key: "view", permissionKey: "view_taxes", label: "Pajak" },
      { key: "view", permissionKey: "view_tax_groups", label: "Grup Pajak" },
      { key: "view", permissionKey: "view_barcodes", label: "Barcode" },
      { key: "view", permissionKey: "view_payment_terms", label: "Termin" },
      { key: "view", permissionKey: "view_payment_methods", label: "Metode Pembayaran" },
      { key: "view", permissionKey: "view_shipping_methods", label: "Metode Pengiriman" },
      { key: "view", permissionKey: "view_units", label: "Satuan" },
    ],
  },
  {
    key: "sales",
    name: "Penjualan",
    route: "/penjualan",
    icon: "DollarSign",
    order: 20,
    actions: [
      { key: "view", permissionKey: "view_quotations", label: "Penawaran" },
      { key: "view", permissionKey: "view_down_payments", label: "Uang Muka" },
      { key: "view", permissionKey: "view_sales_orders", label: "Pesanan" },
      { key: "view", permissionKey: "view_delivery_orders", label: "Surat Jalan" },
      { key: "view", permissionKey: "view_sales_invoices", label: "Faktur" },
      { key: "view", permissionKey: "view_sales_payments", label: "Pembayaran" },
      { key: "view", permissionKey: "view_sales_returns", label: "Retur" },
    ],
  },
  {
    key: "purchase",
    name: "Pembelian",
    route: "/pembelian",
    icon: "ShoppingBag",
    order: 30,
    actions: [
      { key: "view", permissionKey: "view_purchase_requests", label: "Permintaan" },
      { key: "view", permissionKey: "view_purchase_orders", label: "Pesanan" },
      { key: "view", permissionKey: "view_goods_receipts", label: "Penerimaan" },
      { key: "view", permissionKey: "view_vendor_bills", label: "Tagihan" },
      { key: "view", permissionKey: "view_vendor_payments", label: "Pembayaran Vendor" },
      { key: "view", permissionKey: "view_purchase_returns", label: "Retur" },
    ],
  },
  {
    key: "inventory",
    name: "Inventaris",
    route: "/inventaris",
    icon: "Package",
    order: 40,
    actions: [
      { key: "view", permissionKey: "view_inventory", label: "Scan / Rak" },
      { key: "view", permissionKey: "view_stock_moves", label: "Mutasi Stok" },
      { key: "view", permissionKey: "view_stock_adjustments", label: "Penyesuaian" },
      { key: "view", permissionKey: "view_inventory_transfers", label: "Transfer" },
      { key: "view", permissionKey: "view_material_issues", label: "Pengeluaran Material" },
    ],
  },
  {
    key: "manufacturing",
    name: "Manufaktur",
    route: "/produksi",
    icon: "Settings2",
    order: 50,
    actions: [
      { key: "view", permissionKey: "view_production", label: "Produk / BOM" },
      { key: "view", permissionKey: "view_work_orders", label: "Perintah Kerja" },
      { key: "view", permissionKey: "view_bom_revisions", label: "Revisi BOM" },
      { key: "view", permissionKey: "view_qc", label: "Quality Control" },
      { key: "view", permissionKey: "view_production", label: "Biaya Produksi" },
    ],
  },
  {
    key: "hrm",
    name: "SDM",
    route: "/sdm",
    icon: "Users",
    order: 60,
    actions: [
      { key: "view", permissionKey: "view_attendance", label: "Absensi" },
      { key: "view", permissionKey: "manage_holidays", label: "Hari Libur" },
      { key: "view", permissionKey: "view_leave_requests", label: "Cuti & Saldo" },
      { key: "view", permissionKey: "view_overtime", label: "Lembur" },
      { key: "view", permissionKey: "view_payroll", label: "Penggajian" },
      { key: "view", permissionKey: "view_work_schedules", label: "Jadwal Kerja" },
      { key: "view", permissionKey: "view_timesheets", label: "Timesheet" },
      { key: "view", permissionKey: "view_employee_loans", label: "Pinjaman" },
    ],
  },
  {
    key: "finance",
    name: "Keuangan",
    route: "/keuangan",
    icon: "Landmark",
    order: 70,
    actions: [
      { key: "view", permissionKey: "view_journals", label: "Jurnal" },
      { key: "view", permissionKey: "view_expenses", label: "Biaya" },
      { key: "view", permissionKey: "view_petty_cash", label: "Kas Kecil" },
      { key: "view", permissionKey: "view_budgets", label: "Anggaran" },
      { key: "view", permissionKey: "view_cost_centers", label: "Pusat Biaya" },
      { key: "view", permissionKey: "view_bank_statements", label: "Rekening Koran" },
      { key: "view", permissionKey: "view_bank_reconciliation", label: "Rekonsiliasi" },
      { key: "view", permissionKey: "view_statistical_key_figures", label: "Key Figure" },
    ],
  },
  {
    key: "crm",
    name: "CRM",
    route: "/crm",
    icon: "Handshake",
    order: 80,
    actions: [
      { key: "view", permissionKey: "view_leads", label: "Prospek" },
      { key: "view", permissionKey: "view_tickets", label: "Tiket" },
    ],
  },
  {
    key: "vehicles",
    name: "Kendaraan",
    route: "/kendaraan",
    icon: "Car",
    order: 90,
    actions: [
      { key: "view", permissionKey: "view_vehicles", label: "Kendaraan / Model" },
      { key: "view", permissionKey: "view_vehicle_brands", label: "Merek" },
    ],
  },
  {
    key: "projects",
    name: "Proyek",
    route: "/proyek",
    icon: "FolderKanban",
    order: 100,
    actions: [{ key: "view", permissionKey: "view_projects", label: "Lihat" }],
  },
  {
    key: "assets",
    name: "Aset",
    route: "/aset",
    icon: "HardDrive",
    order: 110,
    actions: [
      { key: "view", permissionKey: "view_assets", label: "Semua Aset" },
      { key: "view", permissionKey: "view_asset_categories", label: "Kategori" },
      { key: "view", permissionKey: "view_asset_brands", label: "Merek" },
      { key: "view", permissionKey: "view_asset_transfers", label: "Transfer" },
    ],
  },
  {
    key: "reports",
    name: "Laporan",
    route: "/laporan",
    icon: "TrendingUp",
    order: 120,
    actions: [{ key: "view", permissionKey: "view_reports", label: "Lihat" }],
  },
  {
    key: "settings",
    name: "Pengaturan",
    route: "/pengaturan",
    icon: "Cog",
    order: 999,
    actions: [{ key: "view", permissionKey: "manage_settings", label: "Kelola" }],
  },
]

/** Map icon name → component. Used by sidebar to render module icons from DB rows. */
export const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, ClipboardList, Users, Factory, Package, Building2,
  UserCircle, BookOpen, DollarSign, FileText, Wallet, ShoppingCart,
  Receipt, CreditCard, RotateCcw, ShoppingBag, FileCheck, PackageCheck,
  Undo2, BarChart3, Scale, ArrowLeftRight, Wrench, Settings2, Hammer,
  Clock, Palmtree, Timer, Banknote, Landmark, BookOpenCheck, Coins,
  CircleDollarSign, Handshake, Target, Ticket, HardDrive, TrendingUp,
  Cog, Truck, FileSpreadsheet, Car, FolderKanban,
  CalendarDays, Briefcase, PiggyBank, ScanBarcode, Grid3X3, Tag,
  Globe, ListOrdered, Layers, BadgeDollarSign,
}

export const ACTION_LABELS: Record<ActionKey, string> = {
  view: "Lihat",
  create: "Buat",
  update: "Ubah",
  delete: "Hapus",
  approve: "Setujui",
}
