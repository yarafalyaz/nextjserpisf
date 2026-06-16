import {
  BookOpenCheck, CircleDollarSign, Coins, PiggyBank, Target,
  FileSpreadsheet, Landmark, BarChart3
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Keuangan" }

const financeModules: ModuleItem[] = [
  { label: "Jurnal", href: "/keuangan/jurnal", icon: BookOpenCheck, desc: "Jurnal umum" },
  { label: "Pengeluaran", href: "/keuangan/pengeluaran", icon: CircleDollarSign, desc: "Pengeluaran" },
  { label: "Kas Kecil", href: "/keuangan/kas-kecil", icon: Coins, desc: "Kas kecil" },
  { label: "Anggaran", href: "/keuangan/anggaran", icon: PiggyBank, desc: "Anggaran" },
  { label: "Pusat Biaya", href: "/keuangan/pusat-biaya", icon: Target, desc: "Pusat biaya" },
  { label: "Laporan Bank", href: "/keuangan/laporan-bank", icon: FileSpreadsheet, desc: "Mutasi bank" },
  { label: "Rekonsiliasi Bank", href: "/keuangan/rekonsiliasi-bank", icon: Landmark, desc: "Rekonsiliasi bank" },
  { label: "Angka Kunci Statistik", href: "/keuangan/angka-kunci-statistik", icon: BarChart3, desc: "Key figures statistik" },
]

export default function FinancePage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Keuangan" }]} />
      <h1 id="keuangan-heading" className="text-2xl font-bold text-foreground">
        Keuangan
      </h1>
      <ModuleGrid
        ariaLabel="Modul Keuangan"
        headingId="keuangan-heading"
        items={financeModules}
      />
    </div>
  )
}
