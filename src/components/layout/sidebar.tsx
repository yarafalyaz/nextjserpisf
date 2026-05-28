"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSidebarStore } from "@/lib/stores"
import { X } from "lucide-react"
import {
  LayoutDashboard, ClipboardList, Users, Factory, Package, Building2,
  UserCircle, BookOpen, DollarSign, FileText, Wallet, ShoppingCart,
  Receipt, CreditCard, RotateCcw, ShoppingBag, FileCheck, PackageCheck,
  Undo2, BarChart3, Scale, ArrowLeftRight, Wrench, Settings2, Hammer,
  Clock, Palmtree, Timer, Banknote, Landmark, BookOpenCheck, Coins,
  CircleDollarSign, Handshake, Target, Ticket, HardDrive, TrendingUp,
  Cog, ChevronRight, Truck, FileSpreadsheet, Car, FolderKanban,
  CalendarDays, Briefcase, PiggyBank, ScanBarcode, Grid3X3, Tag,
  Globe, ListOrdered, Layers, BadgeDollarSign
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/page-header"

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  children?: NavItem[]
}

const navigation: NavItem[] = [
  { label: "Dasbor", href: "/", icon: LayoutDashboard },
  {
    label: "Master Data",
    href: "/master",
    icon: ClipboardList,
    children: [
      { label: "Pelanggan", href: "/master/customers", icon: Users },
      { label: "Pemasok", href: "/master/vendors", icon: Factory },
      { label: "Barang", href: "/master/items", icon: Package },
      { label: "Kategori Barang", href: "/master/item-categories", icon: Tag },
      { label: "Merek", href: "/master/brands", icon: Layers },
      { label: "Gudang", href: "/master/warehouses", icon: Building2 },
      { label: "Karyawan", href: "/master/employees", icon: UserCircle },
      { label: "Departemen", href: "/master/departments", icon: Layers },
      { label: "Jabatan", href: "/master/positions", icon: Briefcase },
      { label: "Akun (COA)", href: "/master/accounts", icon: BookOpen },
      { label: "Bank", href: "/master/banks", icon: Landmark },
      { label: "Pajak", href: "/master/taxes", icon: BadgeDollarSign },
      { label: "Grup Pajak", href: "/master/tax-groups", icon: ListOrdered },
      { label: "Mata Uang", href: "/master/currencies", icon: Globe },
      { label: "Daftar Harga", href: "/master/price-lists", icon: FileSpreadsheet },
      { label: "Barcode", href: "/master/barcodes", icon: ScanBarcode },
      { label: "Termin Pembayaran", href: "/master/payment-terms", icon: CalendarDays },
      { label: "Satuan", href: "/master/uom", icon: Scale },
    ],
  },
  {
    label: "Penjualan",
    href: "/sales",
    icon: DollarSign,
    children: [
      { label: "Penawaran", href: "/sales/quotations", icon: FileText },
      { label: "Uang Muka", href: "/sales/down-payments", icon: Wallet },
      { label: "Pesanan Penjualan", href: "/sales/orders", icon: ShoppingCart },
      { label: "Surat Jalan", href: "/sales/delivery-orders", icon: Truck },
      { label: "Faktur", href: "/sales/invoices", icon: Receipt },
      { label: "Pembayaran", href: "/sales/payments", icon: CreditCard },
      { label: "Retur", href: "/sales/returns", icon: RotateCcw },
    ],
  },
  {
    label: "Pembelian",
    href: "/purchase",
    icon: ShoppingBag,
    children: [
      { label: "Permintaan", href: "/purchase/requests", icon: ClipboardList },
      { label: "Pesanan", href: "/purchase/orders", icon: FileCheck },
      { label: "Penerimaan Barang", href: "/purchase/goods-receipts", icon: PackageCheck },
      { label: "Tagihan Vendor", href: "/purchase/bills", icon: FileSpreadsheet },
      { label: "Pembayaran Vendor", href: "/purchase/vendor-payments", icon: Banknote },
      { label: "Retur", href: "/purchase/returns", icon: Undo2 },
    ],
  },
  {
    label: "Inventaris",
    href: "/inventory",
    icon: Package,
    children: [
      { label: "Pergerakan Stok", href: "/inventory/stock-moves", icon: BarChart3 },
      { label: "Penyesuaian", href: "/inventory/adjustments", icon: Scale },
      { label: "Transfer", href: "/inventory/transfers", icon: ArrowLeftRight },
      { label: "Pengeluaran Material", href: "/inventory/material-issues", icon: Wrench },
      { label: "Rak", href: "/inventory/racks", icon: Grid3X3 },
    ],
  },
  {
    label: "Manufaktur",
    href: "/manufacturing",
    icon: Settings2,
    children: [
      { label: "Produk (BOM)", href: "/manufacturing/products", icon: Package },
      { label: "Perintah Kerja", href: "/manufacturing/work-orders", icon: Wrench },
      { label: "Perintah Produksi", href: "/manufacturing/production-orders", icon: Hammer },
    ],
  },
  {
    label: "SDM",
    href: "/hrm",
    icon: Users,
    children: [
      { label: "Absensi", href: "/hrm/attendance", icon: Clock },
      { label: "Cuti", href: "/hrm/leave", icon: Palmtree },
      { label: "Lembur", href: "/hrm/overtime", icon: Timer },
      { label: "Penggajian", href: "/hrm/payroll", icon: Banknote },
      { label: "Jadwal Kerja", href: "/hrm/work-schedules", icon: CalendarDays },
      { label: "Timesheet", href: "/hrm/timesheets", icon: Clock },
      { label: "Pinjaman", href: "/hrm/loans", icon: PiggyBank },
      { label: "Hari Libur", href: "/hrm/holidays", icon: Palmtree },
    ],
  },
  {
    label: "Keuangan",
    href: "/finance",
    icon: Landmark,
    children: [
      { label: "Jurnal", href: "/finance/journals", icon: BookOpenCheck },
      { label: "Biaya", href: "/finance/expenses", icon: CircleDollarSign },
      { label: "Kas Kecil", href: "/finance/petty-cash", icon: Coins },
      { label: "Anggaran", href: "/finance/budgets", icon: PiggyBank },
      { label: "Pusat Biaya", href: "/finance/cost-centers", icon: Target },
      { label: "Rekening Koran", href: "/finance/bank-statements", icon: FileSpreadsheet },
      { label: "Rekonsiliasi Bank", href: "/finance/bank-reconciliation", icon: Landmark },
      { label: "Key Figure Statistik", href: "/finance/statistical-key-figures", icon: BarChart3 },
    ],
  },
  {
    label: "CRM",
    href: "/crm",
    icon: Handshake,
    children: [
      { label: "Prospek", href: "/crm/leads", icon: Target },
      { label: "Tiket", href: "/crm/tickets", icon: Ticket },
    ],
  },
  {
    label: "Kendaraan",
    href: "/vehicles",
    icon: Car,
    children: [
      { label: "Kendaraan", href: "/vehicles", icon: Car },
      { label: "Merek", href: "/vehicles/brands", icon: Tag },
      { label: "Model", href: "/vehicles/models", icon: Layers },
    ],
  },
  { label: "Proyek", href: "/projects", icon: FolderKanban },
  {
    label: "Aset",
    href: "/assets",
    icon: HardDrive,
    children: [
      { label: "Semua Aset", href: "/assets", icon: HardDrive },
      { label: "Kategori", href: "/assets/categories", icon: Tag },
      { label: "Merek", href: "/assets/brands", icon: Layers },
      { label: "Transfer", href: "/assets/transfers", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Laporan",
    href: "/reports",
    icon: TrendingUp,
    children: [
      { label: "Keuangan", href: "/reports/financial", icon: FileSpreadsheet },
      { label: "Neraca Saldo", href: "/reports/trial-balance", icon: Scale },
      { label: "Neraca", href: "/reports/balance-sheet", icon: BookOpen },
      { label: "Arus Kas", href: "/reports/cash-flow", icon: Coins },
      { label: "Piutang Aging", href: "/reports/aging-receivables", icon: Clock },
      { label: "Hutang Aging", href: "/reports/aging-payables", icon: Clock },
      { label: "Aging Inventaris", href: "/reports/aging-inventory", icon: Package },
      { label: "Profit Center", href: "/reports/profit-center-income", icon: TrendingUp },
    ],
  },
  { label: "Pengaturan", href: "/settings", icon: Cog },
]

export function Sidebar() {
  const pathname = usePathname()
  const [expandedItems, setExpandedItems] = useState<string[]>(() => {
    const segments = pathname.split("/").filter(Boolean)
    return segments.length > 0 ? ["/" + segments[0]] : []
  })
  const { isOpen, close } = useSidebarStore()

  const toggleExpand = (href: string) => {
    setExpandedItems((prev) =>
      prev.includes(href) ? [] : [href]
    )
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  const handleNavClick = () => {
    // Close sidebar on mobile after navigation
    if (window.innerWidth <= 1024) {
      close()
    }
  }

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={close} />
      )}

      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <h1 className="sidebar-logo">YaraERP</h1>
          <Button variant="ghost" size="sm" isIconOnly className="sidebar-close-btn lg:hidden" aria-label="Tutup sidebar" onPress={close}>
            <X size={20} />
          </Button>
        </div>

        <nav className="sidebar-nav">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.href} className="nav-group">
                {item.children ? (
                  <>
                    <Button
                      onPress={() => toggleExpand(item.href)}
                      className={`nav-item nav-item-parent ${isActive(item.href) ? "active" : ""}`}
                    >
                      <Icon size={18} className="nav-icon" />
                      <span className="nav-label">{item.label}</span>
                      <ChevronRight size={14} className={`nav-arrow ${expandedItems.includes(item.href) ? "expanded" : ""}`} />
                    </Button>
                    {expandedItems.includes(item.href) && (
                      <div className="nav-children">
                        {item.children.map((child) => {
                          const ChildIcon = child.icon
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={handleNavClick}
                              className={`nav-item nav-item-child ${isActive(child.href) ? "active" : ""}`}
                            >
                              <ChildIcon size={15} className="nav-icon" />
                              <span className="nav-label">{child.label}</span>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href}
                    onClick={handleNavClick}
                    className={`nav-item ${isActive(item.href) ? "active" : ""}`}
                  >
                    <Icon size={18} className="nav-icon" />
                    <span className="nav-label">{item.label}</span>
                  </Link>
                )}
              </div>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
