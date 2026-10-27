import {
  LayoutDashboard, ClipboardList, Users, Factory, Package, Building2,
  UserCircle, BookOpen, DollarSign, FileText, Wallet, ShoppingCart,
  Receipt, CreditCard, RotateCcw, ShoppingBag, FileCheck, PackageCheck,
  Undo2, BarChart3, Scale, Columns3, ArrowLeftRight, Wrench, Settings2, Hammer,
  Clock, Palmtree, Timer, Banknote, Landmark, BookOpenCheck, Coins,
  CircleDollarSign, Handshake, Target, Ticket, HardDrive, TrendingUp,
  Cog, Truck, FileSpreadsheet, Car, FolderKanban,
  CalendarDays, Briefcase, PiggyBank, ScanBarcode, Grid3X3, Tag,
  ListOrdered, Layers, BadgeDollarSign, Gift, ListTodo, GitBranch, ShieldCheck, ClipboardCheck, Percent, ShieldAlert,
  Boxes, CalendarCheck, UserPlus, ReceiptText,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { settingsPermissions } from "./settings-sections"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Permission key required to see this item. Omit = always visible. */
  permission?: string
  /**
   * Alternatif `permission`: item tampil bila pengguna punya SALAH SATU izin ini.
   * Dipakai untuk menu yang isinya turunan dari beberapa modul (mis. Perintah
   * Pembayaran: pemegang izin tagihan ATAU pembayaran vendor) — sama dengan aturan
   * `requireAnyPermission` di halamannya.
   */
  permissions?: string[]
  /**
   * Grup yang isinya sebuah KATALOG, bukan daftar menu: sidebar cukup menautkan
   * ke halaman grupnya, sedangkan daftar isinya dibaca di halaman katalog itu.
   *
   * Dipakai `/laporan` (47 laporan). Submenu 47 baris bukan cara memilih laporan —
   * ia menenggelamkan menu modul lain dan tidak bisa dicari — sementara katalog
   * `/laporan` sudah punya kategori + kotak Cari. `children` tetap ada di sini
   * karena dialah satu sumber untuk label, ikon, izin, deskripsi katalog, dan
   * jejak breadcrumb; yang berubah hanya cara sidebar merendernya.
   */
  sidebarLinkOnly?: boolean
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
    label: "Data Master",
    href: "/master",
    icon: ClipboardList,
    children: [
      { label: "Pelanggan", href: "/master/pelanggan", icon: Users, permission: "view_customers" },
      { label: "Kategori Pelanggan", href: "/master/kategori-pelanggan", icon: Tag, permission: "view_customers" },
      { label: "Pemasok", href: "/master/vendor", icon: Factory, permission: "view_vendors" },
      { label: "Barang", href: "/master/barang", icon: Package, permission: "view_items" },
      { label: "Kategori Barang", href: "/master/kategori-barang", icon: Tag, permission: "view_item_categories" },
      { label: "Grup Barang", href: "/master/grup-barang", icon: Layers, permission: "view_item_groups" },
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
      { label: "Antrean Penawaran", href: "/penjualan/antrean-penawaran", icon: ListTodo, permission: "view_quotations" },
      { label: "Draf Penawaran Basi", href: "/penjualan/antrean-penawaran-draf", icon: ListTodo, permission: "view_quotations" },
      { label: "Pesanan Draft Mengendap", href: "/penjualan/antrean-pesanan-draf", icon: ListTodo, permission: "view_sales_orders" },
      { label: "Faktur Draft Mengendap", href: "/penjualan/antrean-faktur-draf", icon: ListTodo, permission: "view_sales_invoices" },
      { label: "Antrean Penawaran Diterima", href: "/penjualan/antrean-penawaran-diterima", icon: ListTodo, permission: "view_quotations" },
      { label: "Antrean Penagihan", href: "/penjualan/antrean-penagihan", icon: ListTodo, permissions: ["view_reports", "view_sales_invoices"] },
      { label: "Uang Muka", href: "/penjualan/uang-muka", icon: Wallet, permission: "view_down_payments" },
      { label: "Antrean Saldo Kredit Pelanggan", href: "/penjualan/antrean-saldo-kredit", icon: ListTodo, permissions: ["view_sales_invoices", "confirm_down_payments"] },
      { label: "Antrean Verifikasi Uang Muka", href: "/penjualan/antrean-verifikasi-uang-muka", icon: ListTodo, permission: "view_down_payments" },
      { label: "Pesanan Penjualan", href: "/penjualan/pesanan", icon: ShoppingCart, permission: "view_sales_orders" },
      { label: "Antrean Janji Kirim", href: "/penjualan/antrean-janji-kirim", icon: ListTodo, permission: "view_sales_orders" },
      { label: "Surat Jalan", href: "/penjualan/surat-jalan", icon: Truck, permission: "view_delivery_orders" },
      { label: "Faktur", href: "/penjualan/faktur", icon: Receipt, permission: "view_sales_invoices" },
      { label: "Pembayaran", href: "/penjualan/pembayaran", icon: CreditCard, permission: "view_sales_payments" },
      { label: "Retur", href: "/penjualan/retur", icon: RotateCcw, permission: "view_sales_returns" },
      { label: "Tukar Faktur", href: "/penjualan/tukar-faktur", icon: FileCheck, permission: "view_invoice_exchanges" },
      { label: "Daftar Harga Pelanggan", href: "/penjualan/harga-pelanggan", icon: BadgeDollarSign, permission: "view_customer_price_lists" },
      { label: "Override Batas Kredit", href: "/penjualan/override-kredit", icon: ShieldAlert, permissions: ["approve_credit_overrides", "view_reports"] },
    ],
  },
  {
    label: "Pembelian",
    href: "/pembelian",
    icon: ShoppingBag,
    children: [
      { label: "Permintaan", href: "/pembelian/permintaan", icon: ClipboardList, permission: "view_purchase_requests" },
      { label: "Pesanan Pembelian", href: "/pembelian/pesanan", icon: FileCheck, permission: "view_purchase_orders" },
      { label: "Pesanan Pembelian Draft Mengendap", href: "/pembelian/antrean-pesanan-draf", icon: ListTodo, permission: "view_purchase_orders" },
      { label: "Penerimaan Barang", href: "/pembelian/penerimaan", icon: PackageCheck, permission: "view_goods_receipts" },
      { label: "Tagihan Pemasok", href: "/pembelian/tagihan", icon: FileSpreadsheet, permission: "view_vendor_bills" },
      { label: "Pembayaran Pemasok", href: "/pembelian/pembayaran-vendor", icon: Banknote, permission: "view_vendor_payments" },
      { label: "Pembayaran Vendor Draft Mengendap", href: "/pembelian/antrean-pembayaran-draf", icon: ListTodo, permission: "view_vendor_payments" },
      { label: "Perintah Pembayaran", href: "/pembelian/perintah-pembayaran", icon: Banknote, permissions: ["view_vendor_bills", "view_vendor_payments"] },
      { label: "Uang Muka Pembelian", href: "/pembelian/uang-muka", icon: Banknote, permission: "view_purchase_advances" },
      { label: "Harga Pemasok", href: "/pembelian/harga-pemasok", icon: BadgeDollarSign, permission: "view_vendor_prices" },
      { label: "Transfer Pemasok", href: "/pembelian/transfer-pemasok", icon: Banknote, permission: "view_vendor_payments" },
      { label: "Retur", href: "/pembelian/retur", icon: Undo2, permission: "view_purchase_returns" },
    ],
  },
  {
    label: "Inventaris",
    href: "/inventaris",
    icon: Package,
    children: [
      { label: "Pindai Barang", href: "/inventaris/scan", icon: ScanBarcode, permission: "view_inventory" },
      { label: "Mutasi Stok", href: "/inventaris/mutasi-stok", icon: BarChart3, permission: "view_stock_moves" },
      { label: "Penyesuaian", href: "/inventaris/penyesuaian", icon: Scale, permission: "view_stock_adjustments" },
      { label: "Stok Opname", href: "/inventaris/opname", icon: ClipboardCheck, permission: "view_stock_opname" },
      { label: "Sesi Opname", href: "/inventaris/opname/sesi", icon: ClipboardCheck, permission: "view_stock_opname" },
      { label: "Sisa Material", href: "/inventaris/sisa", icon: Scale, permission: "view_material_issues" },
      { label: "Transfer", href: "/inventaris/transfer", icon: ArrowLeftRight, permission: "view_inventory_transfers" },
      { label: "Permintaan Antar Gudang", href: "/inventaris/permintaan-gudang", icon: ClipboardList, permission: "view_material_requests" },
      { label: "Pengeluaran Material", href: "/inventaris/pengeluaran-material", icon: Wrench, permission: "view_material_issues" },
      { label: "Rak", href: "/inventaris/rak", icon: Grid3X3, permission: "view_racks" },
      { label: "Baris Rak", href: "/inventaris/baris-rak", icon: Layers, permission: "view_racks" },
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
      { label: "Perintah Produksi", href: "/produksi/production-orders", icon: Hammer, permission: "view_production_orders" },
      { label: "Pengendalian Mutu", href: "/produksi/qc", icon: ShieldCheck, permission: "view_qc" },
      { label: "Klaim Garansi", href: "/produksi/garansi", icon: ShieldCheck, permission: "view_warranty_claims" },
    ],
  },
  {
    label: "SDM",
    href: "/sdm",
    icon: Users,
    children: [
      { label: "Absensi", href: "/sdm/absensi", icon: CalendarCheck, permission: "view_attendance" },
      { label: "Rekap Kehadiran", href: "/sdm/absensi/rekap", icon: CalendarCheck, permission: "view_attendance" },
      { label: "Koreksi Absensi", href: "/sdm/absensi/koreksi", icon: CalendarCheck, permission: "view_attendance_corrections" },
      { label: "Cuti", href: "/sdm/cuti", icon: Palmtree, permission: "view_leave_requests" },
      { label: "Antrean Persetujuan HR", href: "/sdm/persetujuan", icon: ClipboardCheck, permissions: ["approve_leave_requests", "approve_overtime_requests"] },
      { label: "Saldo Cuti", href: "/sdm/cuti/saldo", icon: Palmtree, permission: "view_leave_requests" },
      { label: "Lembur", href: "/sdm/lembur", icon: Timer, permission: "view_overtime" },
      { label: "Rekap Lembur", href: "/sdm/lembur/rekap", icon: Timer, permission: "view_overtime" },
      { label: "Penggajian", href: "/sdm/penggajian", icon: Banknote, permission: "view_payroll" },
      { label: "Slip Gaji Saya", href: "/sdm/slip-gaji-saya", icon: Wallet },
      { label: "Aturan Statutori", href: "/sdm/aturan-statutori", icon: BookOpenCheck, permission: "view_payroll" },
      { label: "Lembar Waktu", href: "/sdm/lembar-waktu", icon: Clock, permission: "view_timesheets" },
      { label: "Pinjaman", href: "/sdm/pinjaman", icon: PiggyBank, permission: "view_employee_loans" },
      { label: "Pinjaman Saya", href: "/sdm/pinjaman-saya", icon: PiggyBank, permission: "create_employee_loan_requests" },
      { label: "Rekap Pinjaman", href: "/sdm/pinjaman/rekap", icon: PiggyBank, permission: "view_employee_loans" },
      { label: "Apresiasi", href: "/sdm/apresiasi", icon: Gift, permission: "view_appreciations" },
      { label: "Rekrutmen", href: "/sdm/rekrutmen", icon: UserPlus, permission: "view_recruitments" },
      { label: "Penilaian Kinerja", href: "/sdm/kinerja", icon: TrendingUp, permission: "view_performance" },
      { label: "Kompetensi", href: "/sdm/kompetensi", icon: Target, permission: "view_competencies" },
      { label: "Pelatihan", href: "/sdm/pelatihan", icon: BookOpenCheck, permission: "view_trainings" },
      { label: "Perencanaan Suksesi", href: "/sdm/suksesi", icon: GitBranch, permission: "view_succession" },
      { label: "Surat Peringatan", href: "/sdm/disiplin", icon: ShieldAlert, permission: "view_disciplinary_records" },
      { label: "Klaim Reimbursement", href: "/sdm/klaim-reimbursement", icon: ReceiptText, permission: "create_employee_reimbursements" },
      { label: "Kalender Kerja", href: "/sdm/kalender-kerja", icon: CalendarDays, permission: "view_work_schedules" },
    ],
  },
  {
    label: "Keuangan",
    href: "/keuangan",
    icon: Landmark,
    children: [
      { label: "Jurnal", href: "/keuangan/jurnal", icon: BookOpenCheck, permission: "view_journals" },
      { label: "Biaya", href: "/keuangan/pengeluaran", icon: CircleDollarSign, permission: "view_expenses" },
      { label: "Antrean Reimbursement", href: "/keuangan/antrean-reimbursement", icon: ListTodo, permission: "create_employee_reimbursements" },
      { label: "Kas Kecil", href: "/keuangan/kas-kecil", icon: Coins, permission: "view_petty_cash" },
      { label: "Pusat Biaya", href: "/keuangan/pusat-biaya", icon: Target, permission: "view_cost_centers" },
      { label: "Pusat Laba", href: "/keuangan/pusat-laba", icon: TrendingUp, permission: "view_profit_centers" },
      { label: "Rekening Koran", href: "/keuangan/laporan-bank", icon: FileSpreadsheet, permission: "view_bank_statements" },
      { label: "Rekonsiliasi Bank", href: "/keuangan/rekonsiliasi-bank", icon: Landmark, permission: "view_bank_reconciliation" },
      { label: "Transfer Bank", href: "/keuangan/transfer-bank", icon: ArrowLeftRight, permission: "view_bank_transfers" },
      { label: "Penyetoran Pajak", href: "/keuangan/penyetoran-pajak", icon: BadgeDollarSign, permission: "view_tax_payments" },
      { label: "Dokumen Pajak", href: "/keuangan/dokumen-pajak/faktur/tambah", icon: FileCheck, permission: "create_tax_invoices" },
      { label: "Bukti Potong", href: "/keuangan/dokumen-pajak/bupot/tambah", icon: Receipt, permission: "manage_withholding_certificates" },
      { label: "Giro & Cek", href: "/keuangan/giro", icon: Banknote, permission: "view_cheques" },
    ],
  },
  {
    label: "CRM",
    href: "/crm",
    icon: Handshake,
    children: [
      { label: "Prospek", href: "/crm/leads", icon: Target, permission: "view_leads" },
      { label: "Prioritas Lead", href: "/crm/prioritas-lead", icon: ListOrdered, permission: "view_leads" },
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
      { label: "Merek & Model", href: "/kendaraan/merek", icon: Tag, permission: "view_vehicle_brands" },
      { label: "Kompatibilitas", href: "/kendaraan/fitment", icon: Wrench, permission: "view_vehicle_fitments" },
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
      { label: "Grup Aset", href: "/aset/grup", icon: Boxes, permission: "view_asset_groups" },
      { label: "Transfer", href: "/aset/transfer", icon: ArrowLeftRight, permission: "view_asset_transfers" },
    ],
  },
  {
    label: "Laporan",
    href: "/laporan",
    icon: TrendingUp,
    sidebarLinkOnly: true,
    children: [
      { label: "Laba Rugi", href: "/laporan/laba-rugi", icon: TrendingUp, permission: "view_reports" },
      { label: "Laba Rugi Terealisasi", href: "/laporan/laba-rugi-terealisasi", icon: TrendingUp, permission: "view_reports" },
      { label: "Laba Rugi Tidak Terealisasi", href: "/laporan/laba-rugi-tidak-terealisasi", icon: TrendingUp, permission: "view_reports" },
      { label: "Profitabilitas & HPP", href: "/laporan/profitabilitas", icon: TrendingUp, permission: "view_reports" },
      { label: "Histori Proses Penjualan", href: "/laporan/histori-penjualan", icon: TrendingUp, permission: "view_reports" },
      { label: "Histori Proses Pembelian", href: "/laporan/histori-pembelian", icon: TrendingUp, permission: "view_reports" },
      { label: "Pembelian per Kelompok", href: "/laporan/pembelian", icon: TrendingUp, permission: "view_reports" },
      { label: "Gaji Karyawan", href: "/laporan/gaji-karyawan", icon: Users, permission: "view_payroll_reports" },
      { label: "PPh 21 Karyawan", href: "/laporan/pph-21", icon: Users, permission: "view_payroll_reports" },
      { label: "Porsi Gaji", href: "/laporan/porsi-gaji", icon: Users, permission: "view_payroll_reports" },
      { label: "Grafik Keuangan", href: "/laporan/grafik-keuangan", icon: TrendingUp, permission: "view_reports" },
      { label: "Uang Muka Pembelian", href: "/laporan/uang-muka-pembelian", icon: TrendingUp, permission: "view_reports" },
      { label: "Harga Pemasok", href: "/laporan/harga-pemasok", icon: TrendingUp, permission: "view_reports" },
      { label: "Penyetoran Pajak", href: "/laporan/penyetoran-pajak", icon: BadgeDollarSign, permission: "view_reports" },
      { label: "Tukar Faktur", href: "/laporan/tukar-faktur", icon: FileCheck, permission: "view_reports" },
      { label: "Laba Rugi per Proyek", href: "/laporan/laba-rugi-proyek", icon: FolderKanban, permission: "view_reports" },
      { label: "Margin Job Kendaraan", href: "/laporan/margin-kendaraan", icon: TrendingUp, permission: "view_reports" },
      { label: "Laba Rugi per Pusat Biaya", href: "/laporan/laba-rugi-per-pusat-biaya", icon: TrendingUp, permission: "view_reports" },
      { label: "Neraca Saldo", href: "/laporan/neraca-saldo", icon: Scale, permission: "view_reports" },
      { label: "Neraca", href: "/laporan/neraca", icon: BookOpen, permission: "view_reports" },
      { label: "Neraca Skontro", href: "/laporan/neraca-skontro", icon: Columns3, permission: "view_reports" },
      { label: "Rasio Keuangan", href: "/laporan/rasio-keuangan", icon: Percent, permission: "view_reports" },
      { label: "Perubahan Ekuitas", href: "/laporan/perubahan-ekuitas", icon: BarChart3, permission: "view_reports" },
      { label: "Laba Ditahan", href: "/laporan/laba-ditahan", icon: PiggyBank, permission: "view_reports" },
      { label: "Daftar Aset Tetap", href: "/laporan/aset-tetap", icon: HardDrive, permission: "view_reports" },
      { label: "Mutasi Aset Tetap", href: "/laporan/mutasi-aset", icon: ArrowLeftRight, permission: "view_reports" },
      { label: "Daftar Disposisi Aset", href: "/laporan/disposisi-aset", icon: Undo2, permission: "view_reports" },
      { label: "Jurnal Aset Tetap", href: "/laporan/jurnal-aset", icon: BookOpen, permission: "view_reports" },
      { label: "Histori Aset Tetap", href: "/laporan/histori-aset", icon: Clock, permission: "view_reports" },
      { label: "Perbedaan Penyusutan", href: "/laporan/perbedaan-penyusutan", icon: Scale, permission: "view_reports" },
      { label: "Pajak Tangguhan", href: "/laporan/pajak-tangguhan", icon: Scale, permission: "view_reports" },
      { label: "Rekonsiliasi Aset Tetap", href: "/laporan/rekonsiliasi-aset", icon: Scale, permission: "view_reports" },
      { label: "Arus Kas", href: "/laporan/arus-kas", icon: Coins, permission: "view_reports" },
      { label: "Proyeksi Kas", href: "/laporan/proyeksi-kas", icon: Coins, permission: "view_reports" },
      { label: "Perbandingan Periode", href: "/laporan/perbandingan-periode", icon: Scale, permission: "view_reports" },
      { label: "Multi Periode", href: "/laporan/multi-periode", icon: Columns3, permission: "view_reports" },
      { label: "Buku Besar", href: "/laporan/buku-besar", icon: BookOpen, permission: "view_reports" },
      { label: "Buku Bank", href: "/laporan/buku-bank", icon: Landmark, permission: "view_reports" },
      { label: "Pembayaran & Penerimaan per Bank", href: "/laporan/pembayaran-per-bank", icon: Landmark, permission: "view_reports" },
      { label: "Rincian Beban Pembayaran", href: "/laporan/beban-pembayaran", icon: Wallet, permission: "view_reports" },
      { label: "Ringkasan AR/AP", href: "/laporan/ringkasan-ar-ap", icon: Users, permission: "view_reports" },
      { label: "Pajak", href: "/laporan/pajak", icon: Receipt, permission: "view_reports" },
      { label: "Bukti Potong PPh", href: "/laporan/bukti-potong-pph", icon: BadgeDollarSign, permission: "view_reports" },
      { label: "Rekonsiliasi PPN", href: "/laporan/rekonsiliasi-ppn", icon: Receipt, permission: "view_reports" },
      { label: "Posisi SPT", href: "/laporan/posisi-spt", icon: Receipt, permission: "view_reports" },
      { label: "Valuasi Stok", href: "/laporan/valuasi-stok", icon: Package, permission: "view_reports" },
      { label: "Mutasi Stok", href: "/laporan/mutasi-stok", icon: ArrowLeftRight, permission: "view_reports" },
      { label: "Kartu Stok", href: "/laporan/kartu-stok", icon: Package, permission: "view_reports" },
      { label: "Ringkasan Persediaan", href: "/laporan/ringkasan-stok", icon: BarChart3, permission: "view_reports" },
      { label: "Rekonsiliasi Stok", href: "/laporan/rekonsiliasi-stok", icon: Scale, permission: "view_reports" },
      { label: "Selisih Saldo Persediaan", href: "/laporan/selisih-persediaan", icon: Scale, permission: "view_reports" },
      { label: "Barang Diterima Belum Ditagih", href: "/laporan/penerimaan-belum-ditagih", icon: PackageCheck, permission: "view_reports" },
      { label: "Persediaan Terkirim Belum Diterima", href: "/laporan/transfer-terkirim", icon: ArrowLeftRight, permission: "view_reports" },
      { label: "Barang Stok Minimum", href: "/laporan/stok-minimum", icon: Package, permission: "view_reports" },
      { label: "Barang Diterima Sebagian", href: "/laporan/penerimaan-sebagian", icon: PackageCheck, permission: "view_reports" },
      { label: "Pemenuhan Pesanan", href: "/laporan/pemenuhan-pesanan", icon: ShoppingCart, permission: "view_reports" },
      { label: "Terkirim Belum Terfaktur", href: "/laporan/terkirim-belum-terfaktur", icon: FileText, permission: "view_reports" },
      { label: "Piutang Jatuh Tempo", href: "/laporan/piutang-jatuh-tempo", icon: Clock, permission: "view_reports" },
      { label: "Piutang per Pelanggan", href: "/laporan/piutang-pelanggan", icon: Users, permission: "view_reports" },
      { label: "Buku Pembantu Piutang", href: "/laporan/buku-pembantu-piutang", icon: Users, permission: "view_reports" },
      { label: "Statement Pelanggan", href: "/laporan/statement-pelanggan", icon: FileText, permission: "view_reports" },
      { label: "Buku Pembantu Utang", href: "/laporan/buku-pembantu-utang", icon: Building2, permission: "view_reports" },
      { label: "Hutang Jatuh Tempo", href: "/laporan/hutang-jatuh-tempo", icon: Clock, permission: "view_reports" },
      { label: "Total Hutang", href: "/laporan/total-hutang", icon: Banknote, permission: "view_reports" },
      { label: "Umur Stok", href: "/laporan/umur-stok", icon: Package, permission: "view_reports" },
      { label: "Stok Tidak Bergerak", href: "/laporan/stok-tidak-bergerak", icon: Package, permission: "view_reports" },
      { label: "Lembar Penghitungan Stok", href: "/laporan/penghitungan-stok", icon: ClipboardList, permission: "view_reports" },
      { label: "Pusat Laba", href: "/laporan/pusat-laba", icon: TrendingUp, permission: "view_reports" },
      { label: "Harga Beli Multi-Sumber", href: "/laporan/analisis-harga-beli", icon: Package, permission: "view_reports" },
      { label: "Analisis Penjualan", href: "/laporan/analisis-penjualan", icon: BarChart3, permission: "view_reports" },
      { label: "Paparan Diskon Penjualan", href: "/laporan/paparan-diskon-penjualan", icon: Percent, permission: "view_reports" },
      { label: "Rekap Komisi Penjualan", href: "/laporan/rekap-komisi", icon: Banknote, permission: "view_reports" },
      { label: "Saldo Utang Komisi Penjualan", href: "/laporan/saldo-utang-komisi", icon: Banknote, permission: "view_reports" },
      { label: "Target vs Pencapaian Penjualan", href: "/laporan/target-penjualan", icon: Target, permission: "view_reports" },
      { label: "Hasil Penawaran", href: "/laporan/hasil-penawaran", icon: BarChart3, permission: "view_reports" },
      { label: "Riwayat Harga Penawaran", href: "/laporan/riwayat-harga-penawaran", icon: FileText, permission: "view_reports" },
      { label: "Riwayat Harga Jual", href: "/laporan/riwayat-harga-jual", icon: FileText, permission: "view_reports" },
      { label: "Garansi Segera Berakhir", href: "/laporan/garansi-segera-berakhir", icon: ShieldCheck, permission: "view_reports" },
      { label: "Pengingat Servis Berkala", href: "/laporan/servis-berkala", icon: CalendarCheck, permission: "view_reports" },
      { label: "Aging Klaim Supplier", href: "/laporan/aging-klaim-supplier", icon: ShieldCheck, permission: "view_reports" },
      { label: "Corong Prospek", href: "/laporan/corong-prospek", icon: BarChart3, permission: "view_reports" },
      { label: "Serapan Overhead", href: "/laporan/serapan-overhead", icon: TrendingUp, permission: "view_reports" },
      { label: "Bahan & Biaya Pekerjaan", href: "/laporan/biaya-pekerjaan", icon: Hammer, permission: "view_reports" },
      { label: "Varians Produksi", href: "/laporan/varians-produksi", icon: TrendingUp, permission: "view_reports" },
      { label: "Scrap Material", href: "/laporan/scrap-material", icon: Factory, permission: "view_reports" },
      { label: "Estimasi vs Aktual Pekerjaan", href: "/laporan/estimasi-vs-aktual", icon: TrendingUp, permission: "view_reports" },
      { label: "Penyelesaian Pesanan", href: "/laporan/penyelesaian-pekerjaan", icon: PackageCheck, permission: "view_reports" },
      { label: "Umur WIP Berjalan", href: "/laporan/wip-berjalan", icon: Factory, permission: "view_reports" },
      { label: "Rekap Borongan", href: "/laporan/rekap-borongan", icon: Factory, permission: "view_reports" },
      { label: "Jurnal Pekerjaan Pesanan", href: "/laporan/jurnal-pekerjaan", icon: Factory, permission: "view_reports" },
      { label: "Transaksi Bank Terekonsiliasi vs Belum", href: "/laporan/transaksi-bank", icon: Landmark, permission: "view_reports" },
      { label: "Faktur SPT Masa PPN", href: "/laporan/faktur-ppn", icon: Receipt, permission: "view_reports" },
      { label: "Stok Nomor Seri/Batch", href: "/laporan/nomor-seri-batch", icon: Package, permission: "view_reports" },
      { label: "Giro Mundur", href: "/laporan/giro-mundur", icon: Banknote, permission: "view_reports" },
    ],
  },
  { label: "Pengaturan", href: "/pengaturan", icon: Cog, permissions: settingsPermissions() },
  { label: "Kalender", href: "/kalender", icon: CalendarDays, permission: "view_calendar" },
]

/** True when the user may see a nav item (super_admin sees everything). */
export function canSeeNavItem(
  item: NavItem,
  permissions: string[],
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true
  // `permissions` = any-of (lihat NavItem). Item tanpa keduanya selalu tampil.
  if (item.permissions && item.permissions.length > 0) {
    return item.permissions.some((permission) => permissions.includes(permission))
  }
  if (!item.permission) return true
  return permissions.includes(item.permission)
}

export interface FlatNavEntry {
  label: string
  href: string
  icon: LucideIcon
  group: string
  permission?: string
  /** Any-of (lihat NavItem.permissions). */
  permissions?: string[]
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
          // Anak yang punya any-of sendiri tidak mewarisi izin tunggal induknya.
          permission: child.permissions ? undefined : (child.permission ?? item.permission),
          permissions: child.permissions,
        })
      }
    } else {
      out.push({
        label: item.label,
        href: item.href,
        icon: item.icon,
        group: item.label === "Dasbor" ? "Navigasi" : "Lainnya",
        permission: item.permission,
        permissions: item.permissions,
      })
    }
  }
  return out
}
