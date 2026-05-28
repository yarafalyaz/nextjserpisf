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
      { label: "Pelanggan", href: "/master/pelanggan", icon: Users },
      { label: "Pemasok", href: "/master/pemasok", icon: Factory },
      { label: "Barang", href: "/master/barang", icon: Package },
      { label: "Kategori Barang", href: "/master/kategori-barang", icon: Tag },
      { label: "Merek", href: "/master/merek", icon: Layers },
      { label: "Gudang", href: "/master/gudang", icon: Building2 },
      { label: "Karyawan", href: "/master/karyawan", icon: UserCircle },
      { label: "Departemen", href: "/master/departemen", icon: Layers },
      { label: "Jabatan", href: "/master/jabatan", icon: Briefcase },
      { label: "Akun (COA)", href: "/master/akun", icon: BookOpen },
      { label: "Bank", href: "/master/bank", icon: Landmark },
      { label: "Pajak", href: "/master/pajak", icon: BadgeDollarSign },
      { label: "Grup Pajak", href: "/master/kelompok-pajak", icon: ListOrdered },
      { label: "Mata Uang", href: "/master/mata-uang", icon: Globe },
      { label: "Daftar Harga", href: "/master/daftar-harga", icon: FileSpreadsheet },
      { label: "Barcode", href: "/master/barcode", icon: ScanBarcode },
      { label: "Termin Pembayaran", href: "/master/syarat-pembayaran", icon: CalendarDays },
      { label: "Satuan", href: "/master/satuan", icon: Scale },
    ],
  },
  {
    label: "Penjualan",
    href: "/penjualan",
    icon: DollarSign,
    children: [
      { label: "Penawaran", href: "/penjualan/penawaran", icon: FileText },
      { label: "Uang Muka", href: "/penjualan/uang-muka", icon: Wallet },
      { label: "Pesanan Penjualan", href: "/penjualan/pesanan", icon: ShoppingCart },
      { label: "Surat Jalan", href: "/penjualan/surat-jalan", icon: Truck },
      { label: "Faktur", href: "/penjualan/faktur", icon: Receipt },
      { label: "Pembayaran", href: "/penjualan/pembayaran", icon: CreditCard },
      { label: "Retur", href: "/penjualan/retur", icon: RotateCcw },
    ],
  },
  {
    label: "Pembelian",
    href: "/pembelian",
    icon: ShoppingBag,
    children: [
      { label: "Permintaan", href: "/pembelian/permintaan", icon: ClipboardList },
      { label: "Pesanan", href: "/pembelian/pesanan", icon: FileCheck },
      { label: "Penerimaan Barang", href: "/pembelian/penerimaan", icon: PackageCheck },
      { label: "Tagihan Vendor", href: "/pembelian/tagihan", icon: FileSpreadsheet },
      { label: "Pembayaran Vendor", href: "/pembelian/pembayaran-vendor", icon: Banknote },
      { label: "Retur", href: "/pembelian/retur", icon: Undo2 },
    ],
  },
  {
    label: "Inventaris",
    href: "/inventaris",
    icon: Package,
    children: [
      { label: "Pergerakan Stok", href: "/inventaris/mutasi-stok", icon: BarChart3 },
      { label: "Penyesuaian", href: "/inventaris/penyesuaian", icon: Scale },
      { label: "Transfer", href: "/inventaris/transfer", icon: ArrowLeftRight },
      { label: "Pengeluaran Material", href: "/inventaris/pengeluaran-material", icon: Wrench },
      { label: "Rak", href: "/inventaris/rak", icon: Grid3X3 },
    ],
  },
  {
    label: "Manufaktur",
    href: "/produksi",
    icon: Settings2,
    children: [
      { label: "Produk (BOM)", href: "/produksi/products", icon: Package },
      { label: "Perintah Kerja", href: "/produksi/perintah-kerja", icon: Wrench },
      { label: "Perintah Produksi", href: "/produksi/production-orders", icon: Hammer },
    ],
  },
  {
    label: "SDM",
    href: "/sdm",
    icon: Users,
    children: [
      { label: "Absensi", href: "/sdm/absensi", icon: Clock },
      { label: "Cuti", href: "/sdm/cuti", icon: Palmtree },
      { label: "Lembur", href: "/sdm/lembur", icon: Timer },
      { label: "Penggajian", href: "/sdm/penggajian", icon: Banknote },
      { label: "Jadwal Kerja", href: "/sdm/jadwal-kerja", icon: CalendarDays },
      { label: "Timesheet", href: "/sdm/lembar-waktu", icon: Clock },
      { label: "Pinjaman", href: "/sdm/pinjaman", icon: PiggyBank },
      { label: "Hari Libur", href: "/sdm/hari-libur", icon: Palmtree },
    ],
  },
  {
    label: "Keuangan",
    href: "/keuangan",
    icon: Landmark,
    children: [
      { label: "Jurnal", href: "/keuangan/jurnal", icon: BookOpenCheck },
      { label: "Biaya", href: "/keuangan/pengeluaran", icon: CircleDollarSign },
      { label: "Kas Kecil", href: "/keuangan/kas-kecil", icon: Coins },
      { label: "Anggaran", href: "/keuangan/anggaran", icon: PiggyBank },
      { label: "Pusat Biaya", href: "/keuangan/pusat-biaya", icon: Target },
      { label: "Rekening Koran", href: "/keuangan/laporan-bank", icon: FileSpreadsheet },
      { label: "Rekonsiliasi Bank", href: "/keuangan/rekonsiliasi-bank", icon: Landmark },
      { label: "Key Figure Statistik", href: "/keuangan/angka-kunci-statistik", icon: BarChart3 },
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
    href: "/kendaraan",
    icon: Car,
    children: [
      { label: "Kendaraan", href: "/kendaraan", icon: Car },
      { label: "Merek", href: "/kendaraan/merek", icon: Tag },
      { label: "Model", href: "/kendaraan/model", icon: Layers },
    ],
  },
  { label: "Proyek", href: "/proyek", icon: FolderKanban },
  {
    label: "Aset",
    href: "/aset",
    icon: HardDrive,
    children: [
      { label: "Semua Aset", href: "/aset", icon: HardDrive },
      { label: "Kategori", href: "/aset/kategori", icon: Tag },
      { label: "Merek", href: "/aset/merek", icon: Layers },
      { label: "Transfer", href: "/aset/transfer", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Laporan",
    href: "/laporan",
    icon: TrendingUp,
    children: [
      { label: "Keuangan", href: "/laporan/keuangan", icon: FileSpreadsheet },
      { label: "Neraca Saldo", href: "/laporan/neraca-saldo", icon: Scale },
      { label: "Neraca", href: "/laporan/neraca", icon: BookOpen },
      { label: "Arus Kas", href: "/laporan/arus-kas", icon: Coins },
      { label: "Piutang Aging", href: "/laporan/piutang-jatuh-tempo", icon: Clock },
      { label: "Hutang Aging", href: "/laporan/hutang-jatuh-tempo", icon: Clock },
      { label: "Aging Inventaris", href: "/laporan/umur-stok", icon: Package },
      { label: "Profit Center", href: "/laporan/pusat-laba", icon: TrendingUp },
    ],
  },
  { label: "Pengaturan", href: "/pengaturan", icon: Cog },
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
