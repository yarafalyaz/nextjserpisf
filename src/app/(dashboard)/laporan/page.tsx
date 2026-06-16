import {
  FileSpreadsheet, Scale, BookOpen, Coins, Clock, Package, TrendingUp, Target, Users, Receipt, Landmark, FolderKanban, ArrowLeftRight, BarChart3
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laporan" }

const reportsModules: ModuleItem[] = [
  { label: "Laba Rugi", href: "/laporan/laba-rugi", icon: TrendingUp, desc: "Laba rugi multi-step" },
  { label: "Laba Rugi per Proyek", href: "/laporan/laba-rugi-proyek", icon: FolderKanban, desc: "Laba rugi per proyek/WO" },
  { label: "Keuangan", href: "/laporan/keuangan", icon: FileSpreadsheet, desc: "Laporan keuangan" },
  { label: "Neraca Saldo", href: "/laporan/neraca-saldo", icon: Scale, desc: "Neraca saldo" },
  { label: "Neraca", href: "/laporan/neraca", icon: BookOpen, desc: "Neraca" },
  { label: "Arus Kas", href: "/laporan/arus-kas", icon: Coins, desc: "Arus kas" },
  { label: "Buku Besar", href: "/laporan/buku-besar", icon: BookOpen, desc: "Buku besar per akun" },
  { label: "Buku Bank", href: "/laporan/buku-bank", icon: Landmark, desc: "Mutasi bank/kas" },
  { label: "Anggaran vs Aktual", href: "/laporan/anggaran-vs-aktual", icon: Target, desc: "Realisasi anggaran" },
  { label: "Ringkasan AR/AP", href: "/laporan/ringkasan-ar-ap", icon: Users, desc: "Piutang & hutang" },
  { label: "Laporan Pajak", href: "/laporan/pajak", icon: Receipt, desc: "Rekap PPN" },
  { label: "Valuasi Stok", href: "/laporan/valuasi-stok", icon: Package, desc: "Nilai persediaan per gudang" },
  { label: "Mutasi Stok", href: "/laporan/mutasi-stok", icon: ArrowLeftRight, desc: "Mutasi stok masuk/keluar" },
  { label: "Ringkasan Persediaan", href: "/laporan/ringkasan-stok", icon: BarChart3, desc: "Ringkasan & item kritis" },
  { label: "Umur Piutang", href: "/laporan/piutang-jatuh-tempo", icon: Clock, desc: "Umur piutang" },
  { label: "Umur Hutang", href: "/laporan/hutang-jatuh-tempo", icon: Clock, desc: "Umur hutang" },
  { label: "Umur Persediaan", href: "/laporan/umur-stok", icon: Package, desc: "Umur persediaan" },
  { label: "Pusat Laba", href: "/laporan/pusat-laba", icon: TrendingUp, desc: "Laba per pusat" },
]

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Laporan" }]} />
      <h1 id="laporan-heading" className="text-2xl font-bold text-foreground">
        Laporan
      </h1>
      <ModuleGrid
        ariaLabel="Modul Laporan"
        headingId="laporan-heading"
        items={reportsModules}
      />
    </div>
  )
}
