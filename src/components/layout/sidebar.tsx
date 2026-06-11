"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, ClipboardList, Users, Factory, Package, Building2,
  UserCircle, BookOpen, DollarSign, FileText, Wallet, ShoppingCart,
  Receipt, CreditCard, RotateCcw, ShoppingBag, FileCheck, PackageCheck,
  Undo2, BarChart3, Scale, ArrowLeftRight, Wrench, Settings2, Hammer,
  Clock, Palmtree, Timer, Banknote, Landmark, BookOpenCheck, Coins,
  CircleDollarSign, Handshake, Target, Ticket, HardDrive, TrendingUp,
  Cog, ChevronRight, Truck, FileSpreadsheet, Car, FolderKanban,
  CalendarDays, Briefcase, PiggyBank, ScanBarcode, Grid3X3, Tag,
  Globe, ListOrdered, Layers, BadgeDollarSign,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/shadcn/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/shadcn/collapsible"
import { NavUser } from "@/components/layout/nav-user"
import { SafeImage } from "@/components/ui/safe-image"

interface AppSidebarProps {
  companyName?: string
  companyLogo?: string
}


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
      { label: "Barcode", href: "/master/barcode", icon: ScanBarcode },
      { label: "Termin Pembayaran", href: "/master/syarat-pembayaran", icon: CalendarDays },
      { label: "Metode Pembayaran", href: "/master/metode-pembayaran", icon: CreditCard },
      { label: "Metode Pengiriman", href: "/master/metode-pengiriman", icon: Truck },
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
      { label: "Scan Barang", href: "/inventaris/scan", icon: ScanBarcode },
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

function useActive() {
  const pathname = usePathname()
  return {
    isActive: (href: string) =>
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"),
    isGroupActive: (item: NavItem) =>
      item.children?.some((c) =>
        c.href === "/" ? pathname === "/" : pathname === c.href || pathname.startsWith(c.href + "/")
      ) ?? false,
    pathname,
  }
}

import { cn } from "@/lib/utils"

export function AppSidebar({ companyName, companyLogo }: AppSidebarProps) {
  const { isActive, isGroupActive } = useActive()
  const { state, setOpenMobile, isMobile } = useSidebar()

  const handleNav = () => {
    if (isMobile) setOpenMobile(false)
  }

  const isCollapsed = state === "collapsed"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={cn("h-12 border-b border-sidebar-border flex items-center", isCollapsed ? "justify-center p-0" : "px-4 py-0")}>
        {companyLogo ? (
          <Link href="/" onClick={handleNav} className="flex items-center justify-center h-full">
            <SafeImage
              src={companyLogo}
              alt={companyName || "Logo"}
              width={isCollapsed ? 32 : 180}
              height={isCollapsed ? 32 : 36}
              style={
                isCollapsed
                  ? { width: "32px", height: "32px" }
                  : { width: "auto", height: "36px" }
              }
              priority
              className={cn(
                "object-contain transition-all duration-200",
                isCollapsed ? "size-8" : "h-9 w-auto max-w-full"
              )}
            />
          </Link>
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Building2 className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-bold">{companyName || "YaraERP"}</span>
                    <span className="truncate text-xs text-sidebar-foreground/70">Enterprise Suite</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarMenu>
            {navigation.map((item) => {
              const Icon = item.icon
              if (!item.children) {
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
                      <Link href={item.href} onClick={handleNav}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              }
              return (
                <Collapsible
                  key={item.href}
                  asChild
                  defaultOpen={isGroupActive(item)}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={item.label} isActive={isGroupActive(item)}>
                        <Icon />
                        <span>{item.label}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.children.map((child) => (
                          <SidebarMenuSubItem key={child.href}>
                            <SidebarMenuSubButton asChild isActive={isActive(child.href)}>
                              <Link href={child.href} onClick={handleNav}>
                                <child.icon />
                                <span>{child.label}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

// Backwards-compatible alias (older imports used `Sidebar`).
export { AppSidebar as Sidebar }
