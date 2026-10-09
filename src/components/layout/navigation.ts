import {
  LayoutDashboard, ClipboardList, Users, Factory, Package, Building2,
  UserCircle, BookOpen, DollarSign, FileText, Wallet, ShoppingCart,
  Receipt, CreditCard, RotateCcw, ShoppingBag, FileCheck, PackageCheck,
  Undo2, BarChart3, Scale, ArrowLeftRight, Wrench, Settings2, Hammer,
  Clock, Palmtree, Timer, Banknote, Landmark, BookOpenCheck, Coins,
  CircleDollarSign, Handshake, Target, Ticket, HardDrive, TrendingUp,
  Cog, Truck, FileSpreadsheet, Car, FolderKanban,
  CalendarDays, Briefcase, PiggyBank, ScanBarcode, Grid3X3, Tag,
  ListOrdered, Layers, BadgeDollarSign, Gift, ListTodo, GitBranch, ShieldCheck,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Permission key required to see this item. Omit = always visible. */
  permission?: string
  children?: NavItem[]
}

/**
 * SINGLE SOURCE OF TRUTH for the app navigation.
 *
 * Both the sidebar and the command palette (⌘K) render from this list, so a
 * menu added here can never drift out of one of them — the previous setup
 * duplicated the menu twice and the command palette quietly fell out of sync
 * (missing Kategori Pelanggan, Merek, Metode Pembayaran, Baris Rak, QC,
 * Apresiasi, and most reports).
 */
export const navigation: NavItem[] = [
  { label: "Dasbor", href: "/", icon: LayoutDashboard, permission: "view_dashboard" },
  {
    label: "Master Data",
    href: "/master",
    icon: ClipboardList,
    children: [
      { label: "Pelanggan", href: "/master/pelanggan", icon: Users, permission: "view_customers" },
      { label: "Kategori Pelanggan", href: "/master/kategori-pelanggan", icon: Tag, permission: "view_customers" },
      { label: "Vendor", href: "/master/vendor", icon: Factory, permission: "view_vendors" },
      { label: "Barang", href: "/master/barang", icon: Package, permission: "view_items" },
      { label: "Kategori Barang", href: "/master/kategori-barang", icon: Tag, permission: "view_item_categories" },
      { label: "Merek", href: "/master/merek", icon: Layers, permission: "view_brands" },
      { label: "Gudang", href: "/master/gudang", icon: Building2, permission: "view_warehouses" },
      { label: "Karyawan", href: "/master/karyawan", icon: UserCircle, permission: "view_employees" },
      { label: "Departemen", href: "/master/departemen", icon: Layers, permission: "view_departments" },
      { label: "Jabatan", href: "/master/jabatan", icon: Briefcase, permission: "view_positions" },
      { label: "Akun (COA)", href: "/master/akun", icon: BookOpen, permission: "view_accounts" },
      { label: "Bank", href: "/master/bank", icon: Landmark, permission: "view_banks" },
      { label: "Pajak", href: "/master/pajak", icon: BadgeDollarSign, permission: "view_taxes" },
      { label: "Grup Pajak", href: "/master/kelompok-pajak", icon: ListOrdered, permission: "view_tax_groups" },
      { label: "Kategori Pengeluaran", href: "/master/kategori-pengeluaran", icon: Tag, permission: "manage_expense_categories" },
      { label: "Barcode", href: "/master/barcode", icon: ScanBarcode, permission: "view_barcodes" },
      { label: "Termin Pembayaran", href: "/master/syarat-pembayaran", icon: CalendarDays, permission: "view_payment_terms" },
      { label: "Metode Pembayaran", href: "/master/metode-pembayaran", icon: CreditCard, permission: "view_payment_methods" },
      { label: "Metode Pengiriman", href: "/master/metode-pengiriman", icon: Truck, permission: "view_shipping_methods" },
      { label: "Satuan", href: "/master/satuan", icon: Scale, permission: "view_units" },
    ],
  },
  {
    label: "Penjualan",
    href: "/penjualan",
    icon: DollarSign,
    children: [
      { label: "Penawaran", href: "/penjualan/penawaran", icon: FileText, permission: "view_quotations" },
      { label: "Uang Muka", href: "/penjualan/uang-muka", icon: Wallet, permission: "view_down_payments" },
      { label: "Pesanan Penjualan", href: "/penjualan/pesanan", icon: ShoppingCart, permission: "view_sales_orders" },
      { label: "Surat Jalan", href: "/penjualan/surat-jalan", icon: Truck, permission: "view_delivery_orders" },
      { label: "Faktur", href: "/penjualan/faktur", icon: Receipt, permission: "view_sales_invoices" },
      { label: "Pembayaran", href: "/penjualan/pembayaran", icon: CreditCard, permission: "view_sales_payments" },
      { label: "Retur", href: "/penjualan/retur", icon: RotateCcw, permission: "view_sales_returns" },
    ],
  },
  {
    label: "Pembelian",
    href: "/pembelian",
    icon: ShoppingBag,
    children: [
      { label: "Permintaan", href: "/pembelian/permintaan", icon: ClipboardList, permission: "view_purchase_requests" },
      { label: "Pesanan", href: "/pembelian/pesanan", icon: FileCheck, permission: "view_purchase_orders" },
      { label: "Penerimaan Barang", href: "/pembelian/penerimaan", icon: PackageCheck, permission: "view_goods_receipts" },
      { label: "Tagihan Vendor", href: "/pembelian/tagihan", icon: FileSpreadsheet, permission: "view_vendor_bills" },
      { label: "Pembayaran Vendor", href: "/pembelian/pembayaran-vendor", icon: Banknote, permission: "view_vendor_payments" },
      { label: "Retur", href: "/pembelian/retur", icon: Undo2, permission: "view_purchase_returns" },
    ],
  },
  {
    label: "Inventaris",
    href: "/inventaris",
    icon: Package,
    children: [
      { label: "Scan Barang", href: "/inventaris/scan", icon: ScanBarcode, permission: "view_inventory" },
      { label: "Pergerakan Stok", href: "/inventaris/mutasi-stok", icon: BarChart3, permission: "view_stock_moves" },
      { label: "Penyesuaian", href: "/inventaris/penyesuaian", icon: Scale, permission: "view_stock_adjustments" },
      { label: "Transfer", href: "/inventaris/transfer", icon: ArrowLeftRight, permission: "view_inventory_transfers" },
      { label: "Pengeluaran Material", href: "/inventaris/pengeluaran-material", icon: Wrench, permission: "view_material_issues" },
      { label: "Rak", href: "/inventaris/rak", icon: Grid3X3, permission: "view_inventory" },
      { label: "Baris Rak", href: "/inventaris/baris-rak", icon: Layers, permission: "view_inventory" },
    ],
  },
  {
    label: "Manufaktur",
    href: "/produksi",
    icon: Settings2,
    children: [
      { label: "Produk (BOM)", href: "/produksi/products", icon: Package, permission: "view_production" },
      { label: "Revisi BOM", href: "/produksi/bom-revisi", icon: GitBranch, permission: "view_bom_revisions" },
      { label: "Perintah Kerja", href: "/produksi/perintah-kerja", icon: Wrench, permission: "view_work_orders" },
      { label: "Perintah Produksi", href: "/produksi/production-orders", icon: Hammer, permission: "view_production" },
      { label: "Quality Control", href: "/produksi/qc", icon: ShieldCheck, permission: "view_qc" },
    ],
  },
  {
    label: "SDM",
    href: "/sdm",
    icon: Users,
    children: [
      { label: "Cuti", href: "/sdm/cuti", icon: Palmtree, permission: "view_leave_requests" },
      { label: "Saldo Cuti", href: "/sdm/cuti/saldo", icon: Palmtree, permission: "view_leave_requests" },
      { label: "Lembur", href: "/sdm/lembur", icon: Timer, permission: "view_overtime" },
      { label: "Penggajian", href: "/sdm/penggajian", icon: Banknote, permission: "view_payroll" },
      { label: "Timesheet", href: "/sdm/lembar-waktu", icon: Clock, permission: "view_timesheets" },
      { label: "Pinjaman", href: "/sdm/pinjaman", icon: PiggyBank, permission: "view_employee_loans" },
      { label: "Apresiasi", href: "/sdm/apresiasi", icon: Gift, permission: "view_appreciations" },
    ],
  },
  {
    label: "Keuangan",
    href: "/keuangan",
    icon: Landmark,
    children: [
      { label: "Jurnal", href: "/keuangan/jurnal", icon: BookOpenCheck, permission: "view_journals" },
      { label: "Biaya", href: "/keuangan/pengeluaran", icon: CircleDollarSign, permission: "view_expenses" },
      { label: "Kas Kecil", href: "/keuangan/kas-kecil", icon: Coins, permission: "view_petty_cash" },
      { label: "Anggaran", href: "/keuangan/anggaran", icon: PiggyBank, permission: "view_budgets" },
      { label: "Alokasi Key Figure", href: "/anggaran/alokasi-skf", icon: PiggyBank, permission: "view_statistical_key_figures" },
      { label: "Pusat Biaya", href: "/keuangan/pusat-biaya", icon: Target, permission: "view_cost_centers" },
      { label: "Rekening Koran", href: "/keuangan/laporan-bank", icon: FileSpreadsheet, permission: "view_bank_statements" },
      { label: "Rekonsiliasi Bank", href: "/keuangan/rekonsiliasi-bank", icon: Landmark, permission: "view_bank_reconciliation" },
      { label: "Key Figure Statistik", href: "/keuangan/angka-kunci-statistik", icon: BarChart3, permission: "view_statistical_key_figures" },
      { label: "Nilai Key Figure", href: "/keuangan/angka-kunci-statistik/nilai", icon: BarChart3, permission: "view_statistical_key_figures" },
    ],
  },
  {
    label: "CRM",
    href: "/crm",
    icon: Handshake,
    children: [
      { label: "Prospek", href: "/crm/leads", icon: Target, permission: "view_leads" },
      { label: "Tiket", href: "/crm/tickets", icon: Ticket, permission: "view_tickets" },
    ],
  },
  {
    label: "Kendaraan",
    href: "/kendaraan",
    icon: Car,
    children: [
      { label: "Kendaraan", href: "/kendaraan", icon: Car, permission: "view_vehicles" },
      { label: "Kendaraan Pelanggan", href: "/kendaraan/pelanggan", icon: Car, permission: "view_vehicles" },
      { label: "Merek", href: "/kendaraan/merek", icon: Tag, permission: "view_vehicle_brands" },
      { label: "Model", href: "/kendaraan/model", icon: Layers, permission: "view_vehicle_models" },
      { label: "Fitment", href: "/kendaraan/fitment", icon: Wrench, permission: "view_vehicle_fitments" },
    ],
  },
  {
    label: "Proyek",
    href: "/proyek",
    icon: FolderKanban,
    children: [
      { label: "Proyek", href: "/proyek", icon: FolderKanban, permission: "view_projects" },
      { label: "Tugas", href: "/proyek/tugas", icon: ListTodo, permission: "view_projects" },
    ],
  },
  {
    label: "Aset",
    href: "/aset",
    icon: HardDrive,
    children: [
      { label: "Semua Aset", href: "/aset", icon: HardDrive, permission: "view_assets" },
      { label: "Kategori", href: "/aset/kategori", icon: Tag, permission: "view_asset_categories" },
      { label: "Merek", href: "/aset/merek", icon: Layers, permission: "view_asset_brands" },
      { label: "Transfer", href: "/aset/transfer", icon: ArrowLeftRight, permission: "view_asset_transfers" },
    ],
  },
  {
    label: "Laporan",
    href: "/laporan",
    icon: TrendingUp,
    children: [
      { label: "Laba Rugi", href: "/laporan/laba-rugi", icon: TrendingUp, permission: "view_reports" },
      { label: "Laba Rugi per Proyek", href: "/laporan/laba-rugi-proyek", icon: FolderKanban, permission: "view_reports" },
      { label: "Laba Rugi per CC", href: "/laporan/laba-rugi-per-pusat-biaya", icon: TrendingUp, permission: "view_reports" },
      { label: "Keuangan", href: "/laporan/keuangan", icon: FileSpreadsheet, permission: "view_reports" },
      { label: "Neraca Saldo", href: "/laporan/neraca-saldo", icon: Scale, permission: "view_reports" },
      { label: "Neraca", href: "/laporan/neraca", icon: BookOpen, permission: "view_reports" },
      { label: "Arus Kas", href: "/laporan/arus-kas", icon: Coins, permission: "view_reports" },
      { label: "Buku Besar", href: "/laporan/buku-besar", icon: BookOpen, permission: "view_reports" },
      { label: "Buku Bank", href: "/laporan/buku-bank", icon: Landmark, permission: "view_reports" },
      { label: "Anggaran vs Realisasi", href: "/laporan/anggaran-vs-realisasi", icon: Target, permission: "view_reports" },
      { label: "Ringkasan AR/AP", href: "/laporan/ringkasan-ar-ap", icon: Users, permission: "view_reports" },
      { label: "Pajak", href: "/laporan/pajak", icon: Receipt, permission: "view_reports" },
      { label: "Valuasi Stok", href: "/laporan/valuasi-stok", icon: Package, permission: "view_reports" },
      { label: "Mutasi Stok", href: "/laporan/mutasi-stok", icon: ArrowLeftRight, permission: "view_reports" },
      { label: "Ringkasan Persediaan", href: "/laporan/ringkasan-stok", icon: BarChart3, permission: "view_reports" },
      { label: "Rekonsiliasi Stok", href: "/laporan/rekonsiliasi-stok", icon: Scale, permission: "view_reports" },
      { label: "Piutang Aging", href: "/laporan/piutang-jatuh-tempo", icon: Clock, permission: "view_reports" },
      { label: "Hutang Aging", href: "/laporan/hutang-jatuh-tempo", icon: Clock, permission: "view_reports" },
      { label: "Aging Inventaris", href: "/laporan/umur-stok", icon: Package, permission: "view_reports" },
      { label: "Profit Center", href: "/laporan/pusat-laba", icon: TrendingUp, permission: "view_reports" },
      { label: "Harga Beli Multi-Sumber", href: "/laporan/analisis-harga-beli", icon: Package, permission: "view_reports" },
      { label: "Serapan Overhead", href: "/laporan/serapan-overhead", icon: TrendingUp, permission: "view_reports" },
    ],
  },
  { label: "Pengaturan", href: "/pengaturan", icon: Cog, permission: "manage_settings" },
]

/** True when the user may see a nav item (super_admin sees everything). */
export function canSeeNavItem(
  item: NavItem,
  permissions: string[],
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true
  if (!item.permission) return true
  return permissions.includes(item.permission)
}

export interface FlatNavEntry {
  label: string
  href: string
  icon: LucideIcon
  group: string
  permission?: string
}

/**
 * Flatten the navigation tree into a single list of leaf pages for the command
 * palette (⌘K). Parent groups are not included; each leaf carries its group
 * label so the palette can group the results.
 */
export function flattenNavigation(nav: NavItem[] = navigation): FlatNavEntry[] {
  const out: FlatNavEntry[] = []
  for (const item of nav) {
    if (item.children && item.children.length > 0) {
      for (const child of item.children) {
        out.push({
          label: child.label,
          href: child.href,
          icon: child.icon,
          group: item.label,
          permission: child.permission ?? item.permission,
        })
      }
    } else {
      out.push({
        label: item.label,
        href: item.href,
        icon: item.icon,
        group: item.label === "Dasbor" ? "Navigasi" : "Lainnya",
        permission: item.permission,
      })
    }
  }
  return out
}
