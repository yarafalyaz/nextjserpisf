import {
  BookOpenCheck, CircleDollarSign, Coins, PiggyBank, Target,
  FileSpreadsheet, Landmark, BarChart3
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Keuangan" }

const financeModules: ModuleItem[] = [
  { label: "Jurnal", href: "/keuangan/jurnal", icon: BookOpenCheck, desc: "Jurnal umum", permission: "view_journals" },
  { label: "Pengeluaran", href: "/keuangan/pengeluaran", icon: CircleDollarSign, desc: "Pengeluaran", permission: "view_expenses" },
  { label: "Kas Kecil", href: "/keuangan/kas-kecil", icon: Coins, desc: "Kas kecil", permission: "view_petty_cash" },
  { label: "Anggaran", href: "/keuangan/anggaran", icon: PiggyBank, desc: "Anggaran", permission: "view_budgets" },
  { label: "Pusat Biaya", href: "/keuangan/pusat-biaya", icon: Target, desc: "Pusat biaya", permission: "view_cost_centers" },
  { label: "Laporan Bank", href: "/keuangan/laporan-bank", icon: FileSpreadsheet, desc: "Mutasi bank", permission: "view_bank_statements" },
  { label: "Rekonsiliasi Bank", href: "/keuangan/rekonsiliasi-bank", icon: Landmark, desc: "Rekonsiliasi bank", permission: "view_bank_reconciliation" },
  { label: "Angka Kunci Statistik", href: "/keuangan/angka-kunci-statistik", icon: BarChart3, desc: "Key figures statistik", permission: "view_statistical_key_figures" },
]

const FINANCE_PERMISSIONS = [
  "view_journals",
  "view_expenses",
  "view_petty_cash",
  "view_budgets",
  "view_cost_centers",
  "view_bank_statements",
  "view_bank_reconciliation",
  "view_statistical_key_figures",
]

export default async function FinancePage() {
  const user = await requireAnyPermission(FINANCE_PERMISSIONS)
  const isSuperAdmin = user.roles.includes("super_admin")

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
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}
