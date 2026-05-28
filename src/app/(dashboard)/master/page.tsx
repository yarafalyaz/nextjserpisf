import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  Users, Factory, Package, Tag, Layers, Building2, UserCircle,
  Briefcase, BookOpen, Landmark, BadgeDollarSign, ListOrdered,
  Globe, FileSpreadsheet, ScanBarcode, CalendarDays, Scale
} from "lucide-react"

const masterModules = [
  { label: "Customers", href: "/master/pelanggan", icon: Users, desc: "Kelola data pelanggan" },
  { label: "Vendors", href: "/master/pemasok", icon: Factory, desc: "Kelola data vendor/supplier" },
  { label: "Items", href: "/master/barang", icon: Package, desc: "Kelola data barang" },
  { label: "Item Categories", href: "/master/kategori-barang", icon: Tag, desc: "Kategori barang" },
  { label: "Brands", href: "/master/merek", icon: Layers, desc: "Kelola brand/merek" },
  { label: "Warehouses", href: "/master/gudang", icon: Building2, desc: "Kelola gudang" },
  { label: "Employees", href: "/master/karyawan", icon: UserCircle, desc: "Kelola data karyawan" },
  { label: "Departments", href: "/master", icon: Briefcase, desc: "Kelola departemen" },
  { label: "Positions", href: "/master/jabatan", icon: Briefcase, desc: "Kelola jabatan" },
  { label: "Accounts (COA)", href: "/master/akun", icon: BookOpen, desc: "Chart of Accounts" },
  { label: "Banks", href: "/master/bank", icon: Landmark, desc: "Kelola data bank" },
  { label: "Taxes", href: "/master/pajak", icon: BadgeDollarSign, desc: "Kelola pajak" },
  { label: "Tax Groups", href: "/master/kelompok-pajak", icon: ListOrdered, desc: "Grup pajak" },
  { label: "Currencies", href: "/master/mata-uang", icon: Globe, desc: "Kelola mata uang" },
  { label: "Price Lists", href: "/master/daftar-harga", icon: FileSpreadsheet, desc: "Daftar harga" },
  { label: "Barcodes", href: "/master/barcode", icon: ScanBarcode, desc: "Kelola barcode" },
  { label: "Payment Terms", href: "/master/syarat-pembayaran", icon: CalendarDays, desc: "Termin pembayaran" },
  { label: "UoM", href: "/master/satuan", icon: Scale, desc: "Satuan ukuran" },
]

export default function MasterPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Master Data" }]} />
      <h1 className="text-2xl font-bold text-foreground">Master Data</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {masterModules.map((mod) => {
          const Icon = mod.icon
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className="flex items-center gap-4 p-4 bg-surface rounded-xl border border-default shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                <Icon size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{mod.label}</p>
                <p className="text-xs text-muted">{mod.desc}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
