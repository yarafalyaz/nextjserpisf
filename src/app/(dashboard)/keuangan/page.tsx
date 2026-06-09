import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  BookOpenCheck, CircleDollarSign, Coins, PiggyBank, Target,
  FileSpreadsheet, Landmark, BarChart3
} from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Keuangan" }


const financeModules = [
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
      <h1 className="text-2xl font-bold text-foreground">Keuangan</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {financeModules.map((mod) => {
          const Icon = mod.icon
          return (
            <Link key={mod.href} href={mod.href} className="flex items-center gap-4 p-4 bg-surface rounded-xl border border-default shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
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
