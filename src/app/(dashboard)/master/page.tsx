import {
  Users, Factory, Package, Tag, Layers, Building2, UserCircle,
  Briefcase, BookOpen, Landmark, BadgeDollarSign, ListOrdered,
  Globe, ScanBarcode, CalendarDays, Scale
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Master Data" }

const masterModules: ModuleItem[] = [
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
      <h1 id="master-heading" className="text-2xl font-bold text-foreground">
        Data Master
      </h1>
      <ModuleGrid
        ariaLabel="Modul Data Master"
        headingId="master-heading"
        items={masterModules}
      />
    </div>
  )
}
