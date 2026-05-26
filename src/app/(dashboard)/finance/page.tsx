import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  BookOpenCheck, CircleDollarSign, Coins, PiggyBank, Target,
  FileSpreadsheet, Landmark, BarChart3
} from "lucide-react"

const financeModules = [
  { label: "Journals", href: "/finance/journals", icon: BookOpenCheck, desc: "Jurnal umum" },
  { label: "Expenses", href: "/finance/expenses", icon: CircleDollarSign, desc: "Pengeluaran" },
  { label: "Petty Cash", href: "/finance/petty-cash", icon: Coins, desc: "Kas kecil" },
  { label: "Budgets", href: "/finance/budgets", icon: PiggyBank, desc: "Anggaran" },
  { label: "Cost Centers", href: "/finance/cost-centers", icon: Target, desc: "Pusat biaya" },
  { label: "Bank Statements", href: "/finance/bank-statements", icon: FileSpreadsheet, desc: "Mutasi bank" },
  { label: "Bank Recon", href: "/finance/bank-reconciliation", icon: Landmark, desc: "Rekonsiliasi bank" },
  { label: "Statistical KF", href: "/finance/statistical-key-figures", icon: BarChart3, desc: "Key figures statistik" },
]

export default function FinancePage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Finance" }]} />
      <h1 className="text-2xl font-bold text-foreground">Finance</h1>
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
                <p className="text-xs text-muted">{mod.desc}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
