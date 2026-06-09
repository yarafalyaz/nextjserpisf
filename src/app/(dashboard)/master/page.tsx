import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  Users, Factory, Package, Tag, Layers, Building2, UserCircle,
  Briefcase, BookOpen, Landmark, BadgeDollarSign, ListOrdered,
  Globe, ScanBarcode, CalendarDays, Scale
} from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Master Data" }


const masterModules = [
  { label: "Pelanggan", href: "/master/pelanggan", icon: Users, desc: "Kelola data pelanggan" },
  { label: "Pemasok", href: "/master/pemasok", icon: Factory, desc: "Kelola data vendor/supplier" },
  { label: "Item", href: "/master/barang", icon: Package, desc: "Kelola data barang" },
  { label: "Kategori Barang", href: "/master/kategori-barang", icon: Tag, desc: "Kategori barang" },
  { label: "Merek", href: "/master/merek", icon: Layers, desc: "Kelola brand/merek" },
  { label: "Gudang", href: "/master/gudang", icon: Building2, desc: "Kelola gudang" },
  { label: "Karyawan", href: "/master/karyawan", icon: UserCircle, desc: "Kelola data karyawan" },
  { label: "Departemen", href: "/master", icon: Briefcase, desc: "Kelola departemen" },
  { label: "Jabatan", href: "/master/jabatan", icon: Briefcase, desc: "Kelola jabatan" },
  { label: "Akun (COA)", href: "/master/akun", icon: BookOpen, desc: "Chart of Accounts" },
  { label: "Bank", href: "/master/bank", icon: Landmark, desc: "Kelola data bank" },
  { label: "Pajak", href: "/master/pajak", icon: BadgeDollarSign, desc: "Kelola pajak" },
  { label: "Kelompok Pajak", href: "/master/kelompok-pajak", icon: ListOrdered, desc: "Grup pajak" },
  { label: "Mata Uang", href: "/master/mata-uang", icon: Globe, desc: "Kelola mata uang" },
  { label: "Barcode", href: "/master/barcode", icon: ScanBarcode, desc: "Kelola barcode" },
  { label: "Payment Terms", href: "/master/syarat-pembayaran", icon: CalendarDays, desc: "Termin pembayaran" },
  { label: "Satuan", href: "/master/satuan", icon: Scale, desc: "Satuan ukuran" },
]

export default function MasterPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data" }]} />
      <h1 className="text-2xl font-bold text-foreground">Data Master</h1>

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
                <p className="text-xs text-muted-foreground">{mod.desc}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
