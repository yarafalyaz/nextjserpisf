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
  Globe, ListOrdered, Layers, BadgeDollarSign, Gift, ListTodo,
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
  companyLogoDark?: string
  permissions?: string[]
  roles?: string[]
}

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Permission key required to see this item. Omit = always visible. */
  permission?: string
  children?: NavItem[]
}

const navigation: NavItem[] = [
  { label: "Dasbor", href: "/", icon: LayoutDashboard, permission: "view_dashboard" },
  {
    label: "Master Data",
    href: "/master",
    icon: ClipboardList,
    children: [
      { label: "Pelanggan", href: "/master/pelanggan", icon: Users, permission: "view_customers" },
      { label: "Kategori Pelanggan", href: "/master/kategori-pelanggan", icon: Tag, permission: "view_customers" },
      { label: "Pemasok", href: "/master/pemasok", icon: Factory, permission: "view_vendors" },
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
      { label: "Perintah Kerja", href: "/produksi/perintah-kerja", icon: Wrench, permission: "view_work_orders" },
      { label: "Perintah Produksi", href: "/produksi/production-orders", icon: Hammer, permission: "view_production" },
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
      { label: "Merek", href: "/kendaraan/merek", icon: Tag, permission: "view_vehicle_brands" },
      { label: "Model", href: "/kendaraan/model", icon: Layers, permission: "view_vehicles" },
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
      { label: "Keuangan", href: "/laporan/keuangan", icon: FileSpreadsheet, permission: "view_reports" },
      { label: "Neraca Saldo", href: "/laporan/neraca-saldo", icon: Scale, permission: "view_reports" },
      { label: "Neraca", href: "/laporan/neraca", icon: BookOpen, permission: "view_reports" },
      { label: "Arus Kas", href: "/laporan/arus-kas", icon: Coins, permission: "view_reports" },
      { label: "Piutang Aging", href: "/laporan/piutang-jatuh-tempo", icon: Clock, permission: "view_reports" },
      { label: "Hutang Aging", href: "/laporan/hutang-jatuh-tempo", icon: Clock, permission: "view_reports" },
      { label: "Aging Inventaris", href: "/laporan/umur-stok", icon: Package, permission: "view_reports" },
      { label: "Profit Center", href: "/laporan/pusat-laba", icon: TrendingUp, permission: "view_reports" },
      { label: "Laba Rugi per CC", href: "/laporan/laba-rugi-per-pusat-biaya", icon: TrendingUp, permission: "view_reports" },
      { label: "Anggaran vs Realisasi", href: "/laporan/anggaran-vs-realisasi", icon: TrendingUp, permission: "view_reports" },
    ],
  },
  { label: "Pengaturan", href: "/pengaturan", icon: Cog, permission: "manage_settings" },
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

export function AppSidebar({ companyName, companyLogo, companyLogoDark, permissions = [], roles = [] }: AppSidebarProps) {
  const { isActive, isGroupActive } = useActive()
  const { state, setOpenMobile, isMobile } = useSidebar()

  const handleNav = () => {
    if (isMobile) setOpenMobile(false)
  }

  const isCollapsed = state === "collapsed"
  const isSuperAdmin = roles.includes("super_admin")

  /** Check if a single nav item is visible to the current user */
  function canSee(item: NavItem): boolean {
    if (isSuperAdmin) return true
    if (!item.permission) return true
    return permissions.includes(item.permission)
  }

  /** Filter children and return visible items; return null if nothing remains */
  function filterChildren(children: NavItem[]): NavItem[] {
    return children.filter(canSee)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={cn("h-12 border-b border-sidebar-border flex items-center", isCollapsed ? "justify-center p-0" : "px-4 py-0")}>
        {companyLogo ? (
          <Link href="/" onClick={handleNav} className="flex items-center justify-center h-full">
            {/* Light logo — visible di mode terang, hidden di mode gelap. */}
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
              className={`object-contain transition-all duration-200 dark:hidden ${
                isCollapsed ? "size-8" : "h-9 w-auto max-w-full"
              }`}
            />
            {/* Dark logo — hidden di mode terang, visible di mode gelap. */}
            {companyLogoDark ? (
              <SafeImage
                src={companyLogoDark}
                alt={companyName || "Logo"}
                width={isCollapsed ? 32 : 180}
                height={isCollapsed ? 32 : 36}
                style={
                  isCollapsed
                    ? { width: "32px", height: "32px" }
                    : { width: "auto", height: "36px" }
                }
                priority
                className={`object-contain transition-all duration-200 hidden dark:block ${
                  isCollapsed ? "size-8" : "h-9 w-auto max-w-full"
                }`}
              />
            ) : null}
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
                    <span className="truncate text-xs text-sidebar-foreground/70">Paket Perusahaan</span>
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

              // Leaf item (no children)
              if (!item.children) {
                if (!canSee(item)) return null
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

              // Group item — filter children first
              const visibleChildren = filterChildren(item.children)
              if (visibleChildren.length === 0) return null

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
                        {visibleChildren.map((child) => (
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
