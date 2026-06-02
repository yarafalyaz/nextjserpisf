"use client"

import { Command } from "cmdk"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  Home, Users, Factory, Package, Building2, UserCircle, BookOpen,
  FileText, ShoppingCart, Receipt, CreditCard, Wallet, RotateCcw,
  ClipboardList, FileCheck, PackageCheck, Undo2,
  BarChart3, Scale, ArrowLeftRight, PackageX,
  Wrench, Clock, Palmtree, Timer, Banknote,
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
  { label: "Pelanggan", href: "/master/pelanggan", icon: Users, group: "Master Data" },
  { label: "Pemasok", href: "/master/pemasok", icon: Factory, group: "Master Data" },
  { label: "Barang", href: "/master/barang", icon: Package, group: "Master Data" },
  { label: "Kategori Barang", href: "/master/kategori-barang", icon: Tag, group: "Master Data" },
  { label: "Gudang", href: "/master/gudang", icon: Building2, group: "Master Data" },
  { label: "Karyawan", href: "/master/karyawan", icon: UserCircle, group: "Master Data" },
  { label: "Departemen", href: "/master/departemen", icon: Layers, group: "Master Data" },
  { label: "Jabatan", href: "/master/jabatan", icon: Briefcase, group: "Master Data" },
  { label: "Akun (COA)", href: "/master/akun", icon: BookOpen, group: "Master Data" },
  { label: "Bank", href: "/master/bank", icon: Landmark, group: "Master Data" },
  { label: "Pajak", href: "/master/pajak", icon: BadgeDollarSign, group: "Master Data" },
  { label: "Grup Pajak", href: "/master/kelompok-pajak", icon: ListOrdered, group: "Master Data" },
  { label: "Mata Uang", href: "/master/mata-uang", icon: Globe, group: "Master Data" },
  { label: "Daftar Harga", href: "/master/daftar-harga", icon: FileSpreadsheet, group: "Master Data" },
  { label: "Barcode", href: "/master/barcode", icon: ScanBarcode, group: "Master Data" },
  { label: "Satuan", href: "/master/satuan", icon: Scale, group: "Master Data" },
  // Penjualan
  { label: "Penawaran", href: "/penjualan/penawaran", icon: FileText, group: "Penjualan" },
  { label: "Pesanan Penjualan", href: "/penjualan/pesanan", icon: ShoppingCart, group: "Penjualan" },
  { label: "Surat Jalan", href: "/penjualan/surat-jalan", icon: Truck, group: "Penjualan" },
  { label: "Faktur", href: "/penjualan/faktur", icon: Receipt, group: "Penjualan" },
  { label: "Pembayaran", href: "/penjualan/pembayaran", icon: CreditCard, group: "Penjualan" },
  { label: "Uang Muka", href: "/penjualan/uang-muka", icon: Wallet, group: "Penjualan" },
  { label: "Retur Penjualan", href: "/penjualan/retur", icon: RotateCcw, group: "Penjualan" },
  // Pembelian
  { label: "Permintaan Pembelian", href: "/pembelian/permintaan", icon: ClipboardList, group: "Pembelian" },
  { label: "Pesanan Pembelian", href: "/pembelian/pesanan", icon: FileCheck, group: "Pembelian" },
  { label: "Penerimaan Barang", href: "/pembelian/penerimaan", icon: PackageCheck, group: "Pembelian" },
  { label: "Tagihan Vendor", href: "/pembelian/tagihan", icon: FileSpreadsheet, group: "Pembelian" },
  { label: "Pembayaran Vendor", href: "/pembelian/pembayaran-vendor", icon: Banknote, group: "Pembelian" },
  { label: "Retur Pembelian", href: "/pembelian/retur", icon: Undo2, group: "Pembelian" },
  // Inventaris
  { label: "Pergerakan Stok", href: "/inventaris/mutasi-stok", icon: BarChart3, group: "Inventaris" },
  { label: "Penyesuaian Stok", href: "/inventaris/penyesuaian", icon: Scale, group: "Inventaris" },
  { label: "Transfer Inventaris", href: "/inventaris/transfer", icon: ArrowLeftRight, group: "Inventaris" },
  { label: "Pengeluaran Material", href: "/inventaris/pengeluaran-material", icon: PackageX, group: "Inventaris" },
  { label: "Rak", href: "/inventaris/rak", icon: Grid3X3, group: "Inventaris" },
  // Manufaktur
  { label: "Produk (BOM)", href: "/produksi/products", icon: Package, group: "Manufaktur" },
  { label: "Perintah Kerja", href: "/produksi/perintah-kerja", icon: Wrench, group: "Manufaktur" },
  { label: "Perintah Produksi", href: "/produksi/production-orders", icon: Hammer, group: "Manufaktur" },
  // SDM
  { label: "Absensi", href: "/sdm/absensi", icon: Clock, group: "SDM" },
  { label: "Cuti", href: "/sdm/cuti", icon: Palmtree, group: "SDM" },
  { label: "Lembur", href: "/sdm/lembur", icon: Timer, group: "SDM" },
  { label: "Penggajian", href: "/sdm/penggajian", icon: Banknote, group: "SDM" },
  { label: "Jadwal Kerja", href: "/sdm/jadwal-kerja", icon: CalendarDays, group: "SDM" },
  { label: "Timesheet", href: "/sdm/lembar-waktu", icon: Clock, group: "SDM" },
  { label: "Pinjaman Karyawan", href: "/sdm/pinjaman", icon: PiggyBank, group: "SDM" },
  { label: "Hari Libur", href: "/sdm/hari-libur", icon: Palmtree, group: "SDM" },
  // Keuangan
  { label: "Jurnal", href: "/keuangan/jurnal", icon: BookOpenCheck, group: "Keuangan" },
  { label: "Biaya", href: "/keuangan/pengeluaran", icon: DollarSign, group: "Keuangan" },
  { label: "Kas Kecil", href: "/keuangan/kas-kecil", icon: Coins, group: "Keuangan" },
  { label: "Anggaran", href: "/keuangan/anggaran", icon: PiggyBank, group: "Keuangan" },
  { label: "Pusat Biaya", href: "/keuangan/pusat-biaya", icon: Target, group: "Keuangan" },
  { label: "Rekening Koran", href: "/keuangan/laporan-bank", icon: FileSpreadsheet, group: "Keuangan" },
  { label: "Rekonsiliasi Bank", href: "/keuangan/rekonsiliasi-bank", icon: Landmark, group: "Keuangan" },
  { label: "Key Figure Statistik", href: "/keuangan/angka-kunci-statistik", icon: BarChart3, group: "Keuangan" },
  // CRM
  { label: "Prospek", href: "/crm/leads", icon: Target, group: "CRM" },
  { label: "Tiket", href: "/crm/tickets", icon: Ticket, group: "CRM" },
  // Kendaraan
  { label: "Kendaraan", href: "/kendaraan", icon: Car, group: "Kendaraan" },
  { label: "Merek Kendaraan", href: "/kendaraan/merek", icon: Tag, group: "Kendaraan" },
  { label: "Model Kendaraan", href: "/kendaraan/model", icon: Layers, group: "Kendaraan" },
  // Proyek
  { label: "Proyek", href: "/proyek", icon: FolderKanban, group: "Proyek" },
  // Aset
  { label: "Semua Aset", href: "/aset", icon: Monitor, group: "Aset" },
  { label: "Kategori Aset", href: "/aset/kategori", icon: Tag, group: "Aset" },
  { label: "Merek Aset", href: "/aset/merek", icon: Layers, group: "Aset" },
  { label: "Transfer Aset", href: "/aset/transfer", icon: ArrowLeftRight, group: "Aset" },
  // Laporan
  { label: "Laporan Keuangan", href: "/laporan/keuangan", icon: PieChart, group: "Laporan" },
  { label: "Neraca Saldo", href: "/laporan/neraca-saldo", icon: Scale, group: "Laporan" },
  { label: "Neraca", href: "/laporan/neraca", icon: BookOpen, group: "Laporan" },
  { label: "Arus Kas", href: "/laporan/arus-kas", icon: Coins, group: "Laporan" },
  { label: "Piutang Aging", href: "/laporan/piutang-jatuh-tempo", icon: Clock, group: "Laporan" },
  { label: "Hutang Aging", href: "/laporan/hutang-jatuh-tempo", icon: Clock, group: "Laporan" },
  { label: "Aging Inventaris", href: "/laporan/umur-stok", icon: Package, group: "Laporan" },
  { label: "Profit Center", href: "/laporan/pusat-laba", icon: TrendingUp, group: "Laporan" },
  // Sistem
  { label: "Pengaturan", href: "/pengaturan", icon: Cog, group: "Sistem" },
  { label: "Pengguna & Peran", href: "/pengaturan/pengguna", icon: Shield, group: "Sistem" },
  { label: "Log Aktivitas", href: "/pengaturan/log-aktivitas", icon: ScrollText, group: "Sistem" },
  { label: "Persetujuan", href: "/pengaturan/persetujuan", icon: CheckCircle2, group: "Sistem" },
  { label: "Notifikasi", href: "/notifikasi", icon: Bell, group: "Sistem" },
  // Aksi Cepat
  { label: "Buat Pelanggan Baru", href: "/master/pelanggan/tambah", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Penawaran", href: "/penjualan/penawaran/tambah", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Pesanan Pembelian", href: "/pembelian/pesanan/tambah", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Pembayaran Faktur", href: "/penjualan/pembayaran/tambah", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Biaya", href: "/keuangan/pengeluaran/tambah", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Entri Jurnal", href: "/keuangan/jurnal/tambah", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Surat Jalan", href: "/penjualan/surat-jalan/tambah", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Proyek", href: "/proyek/tambah", icon: Plus, group: "Aksi Cepat" },
  { label: "Buat Tagihan Vendor", href: "/pembelian/tagihan/tambah", icon: Plus, group: "Aksi Cepat" },
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
