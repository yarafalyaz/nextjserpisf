"use client"

import { Command } from "cmdk"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  Home, Users, Factory, Package, Building2, UserCircle, BookOpen,
  FileText, ShoppingCart, Receipt, CreditCard, Wallet, RotateCcw,
  ClipboardList, FileCheck, PackageCheck, Undo2,
  BarChart3, Scale, ArrowLeftRight, PackageX,
  Wrench, Settings2,
  Clock, Palmtree, Timer, Banknote,
  BookOpenCheck, DollarSign, Coins, Landmark,
  Target, Ticket, Monitor,
  TrendingUp, PieChart,
  Cog, Shield, ScrollText, CheckCircle2, Bell,
  Plus, Search, Truck, FileSpreadsheet, Car, FolderKanban,
  CalendarDays, Briefcase, PiggyBank, ScanBarcode, Grid3X3, Tag,
  Globe, ListOrdered, Layers, BadgeDollarSign, Hammer
} from "lucide-react"

const menuItems = [
  { label: "Dasbor", href: "/", icon: Home, group: "Navigasi" },
  // Master Data
  { label: "Pelanggan", href: "/master/customers", icon: Users, group: "Master Data" },
  { label: "Pemasok", href: "/master/vendors", icon: Factory, group: "Master Data" },
  { label: "Barang", href: "/master/items", icon: Package, group: "Master Data" },
  { label: "Kategori Barang", href: "/master/item-categories", icon: Tag, group: "Master Data" },
  { label: "Gudang", href: "/master/warehouses", icon: Building2, group: "Master Data" },
  { label: "Karyawan", href: "/master/employees", icon: UserCircle, group: "Master Data" },
  { label: "Departemen", href: "/master/departments", icon: Layers, group: "Master Data" },
  { label: "Jabatan", href: "/master/positions", icon: Briefcase, group: "Master Data" },
  { label: "Akun (COA)", href: "/master/accounts", icon: BookOpen, group: "Master Data" },
  { label: "Bank", href: "/master/banks", icon: Landmark, group: "Master Data" },
  { label: "Pajak", href: "/master/taxes", icon: BadgeDollarSign, group: "Master Data" },
  { label: "Grup Pajak", href: "/master/tax-groups", icon: ListOrdered, group: "Master Data" },
  { label: "Mata Uang", href: "/master/currencies", icon: Globe, group: "Master Data" },
  { label: "Daftar Harga", href: "/master/price-lists", icon: FileSpreadsheet, group: "Master Data" },
  { label: "Barcode", href: "/master/barcodes", icon: ScanBarcode, group: "Master Data" },
  { label: "Satuan", href: "/master/uom", icon: Scale, group: "Master Data" },
  // Penjualan
  { label: "Penawaran", href: "/sales/quotations", icon: FileText, group: "Penjualan" },
  { label: "Pesanan Penjualan", href: "/sales/orders", icon: ShoppingCart, group: "Penjualan" },
  { label: "Surat Jalan", href: "/sales/delivery-orders", icon: Truck, group: "Penjualan" },
  { label: "Faktur", href: "/sales/invoices", icon: Receipt, group: "Penjualan" },
  { label: "Pembayaran", href: "/sales/payments", icon: CreditCard, group: "Penjualan" },
  { label: "Uang Muka", href: "/sales/down-payments", icon: Wallet, group: "Penjualan" },
  { label: "Retur Penjualan", href: "/sales/returns", icon: RotateCcw, group: "Penjualan" },
  // Pembelian
  { label: "Permintaan Pembelian", href: "/purchase/requests", icon: ClipboardList, group: "Pembelian" },
  { label: "Pesanan Pembelian", href: "/purchase/orders", icon: FileCheck, group: "Pembelian" },
  { label: "Penerimaan Barang", href: "/purchase/goods-receipts", icon: PackageCheck, group: "Pembelian" },
  { label: "Tagihan Vendor", href: "/purchase/bills", icon: FileSpreadsheet, group: "Pembelian" },
  { label: "Pembayaran Vendor", href: "/purchase/vendor-payments", icon: Banknote, group: "Pembelian" },
  { label: "Retur Pembelian", href: "/purchase/returns", icon: Undo2, group: "Pembelian" },
  // Inventaris
  { label: "Pergerakan Stok", href: "/inventory/stock-moves", icon: BarChart3, group: "Inventaris" },
  { label: "Penyesuaian Stok", href: "/inventory/adjustments", icon: Scale, group: "Inventaris" },
  { label: "Transfer Inventaris", href: "/inventory/transfers", icon: ArrowLeftRight, group: "Inventaris" },
  { label: "Pengeluaran Material", href: "/inventory/material-issues", icon: PackageX, group: "Inventaris" },
  { label: "Rak", href: "/inventory/racks", icon: Grid3X3, group: "Inventaris" },
  // Manufaktur
  { label: "Produk (BOM)", href: "/manufacturing/products", icon: Package, group: "Manufaktur" },
  { label: "Perintah Kerja", href: "/manufacturing/work-orders", icon: Wrench, group: "Manufaktur" },
  { label: "Perintah Produksi", href: "/manufacturing/production-orders", icon: Hammer, group: "Manufaktur" },
  // SDM
  { label: "Absensi", href: "/hrm/attendance", icon: Clock, group: "SDM" },
  { label: "Cuti", href: "/hrm/leave", icon: Palmtree, group: "SDM" },
  { label: "Lembur", href: "/hrm/overtime", icon: Timer, group: "SDM" },
  { label: "Penggajian", href: "/hrm/payroll", icon: Banknote, group: "SDM" },
  { label: "Jadwal Kerja", href: "/hrm/work-schedules", icon: CalendarDays, group: "SDM" },
  { label: "Timesheet", href: "/hrm/timesheets", icon: Clock, group: "SDM" },
  { label: "Pinjaman Karyawan", href: "/hrm/loans", icon: PiggyBank, group: "SDM" },
  { label: "Hari Libur", href: "/hrm/holidays", icon: Palmtree, group: "SDM" },
  // Keuangan
  { label: "Jurnal", href: "/finance/journals", icon: BookOpenCheck, group: "Keuangan" },
  { label: "Biaya", href: "/finance/expenses", icon: DollarSign, group: "Keuangan" },
  { label: "Kas Kecil", href: "/finance/petty-cash", icon: Coins, group: "Keuangan" },
  { label: "Anggaran", href: "/finance/budgets", icon: PiggyBank, group: "Keuangan" },
  { label: "Pusat Biaya", href: "/finance/cost-centers", icon: Target, group: "Keuangan" },
  { label: "Rekening Koran", href: "/finance/bank-statements", icon: FileSpreadsheet, group: "Keuangan" },
  { label: "Rekonsiliasi Bank", href: "/finance/bank-reconciliation", icon: Landmark, group: "Keuangan" },
  { label: "Key Figure Statistik", href: "/finance/statistical-key-figures", icon: BarChart3, group: "Keuangan" },
  // CRM
  { label: "Prospek", href: "/crm/leads", icon: Target, group: "CRM" },
  { label: "Tiket", href: "/crm/tickets", icon: Ticket, group: "CRM" },
  // Kendaraan
  { label: "Kendaraan", href: "/vehicles", icon: Car, group: "Kendaraan" },
  { label: "Merek Kendaraan", href: "/vehicles/brands", icon: Tag, group: "Kendaraan" },
  { label: "Model Kendaraan", href: "/vehicles/models", icon: Layers, group: "Kendaraan" },
  // Proyek
  { label: "Proyek", href: "/projects", icon: FolderKanban, group: "Proyek" },
  // Aset
  { label: "Semua Aset", href: "/assets", icon: Monitor, group: "Aset" },
  { label: "Kategori Aset", href: "/assets/categories", icon: Tag, group: "Aset" },
  { label: "Merek Aset", href: "/assets/brands", icon: Layers, group: "Aset" },
  { label: "Transfer Aset", href: "/assets/transfers", icon: ArrowLeftRight, group: "Aset" },
  // Laporan
  { label: "Laporan Keuangan", href: "/reports/financial", icon: PieChart, group: "Laporan" },
  { label: "Neraca Saldo", href: "/reports/trial-balance", icon: Scale, group: "Laporan" },
  { label: "Neraca", href: "/reports/balance-sheet", icon: BookOpen, group: "Laporan" },
  { label: "Arus Kas", href: "/reports/cash-flow", icon: Coins, group: "Laporan" },
  { label: "Piutang Aging", href: "/reports/aging-receivables", icon: Clock, group: "Laporan" },
  { label: "Hutang Aging", href: "/reports/aging-payables", icon: Clock, group: "Laporan" },
  { label: "Aging Inventaris", href: "/reports/aging-inventory", icon: Package, group: "Laporan" },
  { label: "Profit Center", href: "/reports/profit-center-income", icon: TrendingUp, group: "Laporan" },
  // Sistem
  { label: "Pengaturan", href: "/settings", icon: Cog, group: "Sistem" },
  { label: "Pengguna & Peran", href: "/settings/users", icon: Shield, group: "Sistem" },
  { label: "Log Aktivitas", href: "/settings/activity-log", icon: ScrollText, group: "Sistem" },
  { label: "Persetujuan", href: "/settings/approvals", icon: CheckCircle2, group: "Sistem" },
  { label: "Notifikasi", href: "/notifications", icon: Bell, group: "Sistem" },
  // Aksi Cepat
  { label: "Buat Pelanggan Baru", href: "/master/customers/create", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Penawaran", href: "/sales/quotations/create", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Pesanan Pembelian", href: "/purchase/orders/create", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Pembayaran Faktur", href: "/sales/payments/create", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Biaya", href: "/finance/expenses/create", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Entri Jurnal", href: "/finance/journals/create", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Surat Jalan", href: "/sales/delivery-orders/create", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Proyek", href: "/projects/create", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Tagihan Vendor", href: "/purchase/bills/create", icon: Plus, group: "Aksi Cepat" },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  function handleSelect(href: string) {
    setOpen(false)
    router.push(href)
  }

  if (!open) return null

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk-container" onClick={(e) => e.stopPropagation()}>
        <Command className="cmdk-root" loop>
          <div className="cmdk-input-wrapper">
            <Search size={18} className="cmdk-search-icon" />
            <Command.Input
              className="cmdk-input"
              placeholder="Cari menu, halaman, atau aksi..."
              autoFocus
            />
          </div>
          <Command.List className="cmdk-list">
            <Command.Empty className="cmdk-empty">
              Tidak ditemukan. Coba kata kunci lain.
            </Command.Empty>

            {["Aksi Cepat", "Navigasi", "Master Data", "Penjualan", "Pembelian", "Inventaris", "Manufaktur", "SDM", "Keuangan", "CRM", "Kendaraan", "Proyek", "Aset", "Laporan", "Sistem"].map((group) => {
              const items = menuItems.filter((i) => i.group === group)
              if (items.length === 0) return null
              return (
                <Command.Group key={group} heading={group} className="cmdk-group">
                  {items.map((item) => {
                    const Icon = item.icon
                    return (
                      <Command.Item
                        key={item.href}
                        value={`${item.label} ${item.group}`}
                        onSelect={() => handleSelect(item.href)}
                        className="cmdk-item"
                      >
                        <Icon size={16} className="cmdk-item-icon" />
                        <span className="cmdk-item-label">{item.label}</span>
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              )
            })}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
