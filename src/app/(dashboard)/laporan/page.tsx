import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  FileSpreadsheet, Scale, BookOpen, Coins, Clock, Package, TrendingUp, Target, Users, Receipt, Landmark, FolderKanban, ArrowLeftRight, BarChart3
} from "lucide-react"

const reportsModules = [
  { label: "Income Statement", href: "/reports/income-statement", icon: TrendingUp, desc: "Laba rugi multi-step" },
  { label: "P&L by Project", href: "/reports/project-pnl", icon: FolderKanban, desc: "Laba rugi per project/WO" },
  { label: "Financial", href: "/reports/financial", icon: FileSpreadsheet, desc: "Laporan keuangan" },
  { label: "Trial Balance", href: "/reports/trial-balance", icon: Scale, desc: "Neraca saldo" },
  { label: "Balance Sheet", href: "/reports/balance-sheet", icon: BookOpen, desc: "Neraca" },
  { label: "Cash Flow", href: "/reports/cash-flow", icon: Coins, desc: "Arus kas" },
  { label: "General Ledger", href: "/reports/general-ledger", icon: BookOpen, desc: "Buku besar per akun" },
  { label: "Bank Book", href: "/reports/bank-book", icon: Landmark, desc: "Mutasi bank/kas" },
  { label: "Budget vs Actual", href: "/reports/budget-vs-actual", icon: Target, desc: "Realisasi anggaran" },
  { label: "AR/AP Summary", href: "/reports/ar-ap-summary", icon: Users, desc: "Piutang & hutang" },
  { label: "Tax Report", href: "/reports/tax-report", icon: Receipt, desc: "Rekap PPN" },
  { label: "Stock Valuation", href: "/reports/stock-valuation", icon: Package, desc: "Nilai persediaan per gudang" },
  { label: "Stock Movement", href: "/reports/stock-movement", icon: ArrowLeftRight, desc: "Mutasi stok masuk/keluar" },
  { label: "Inventory Summary", href: "/reports/inventory-summary", icon: BarChart3, desc: "Ringkasan & item kritis" },
  { label: "Aging Receivables", href: "/reports/aging-receivables", icon: Clock, desc: "Umur piutang" },
  { label: "Aging Payables", href: "/reports/aging-payables", icon: Clock, desc: "Umur hutang" },
  { label: "Aging Inventory", href: "/reports/aging-inventory", icon: Package, desc: "Umur persediaan" },
  { label: "Profit Center", href: "/reports/profit-center-income", icon: TrendingUp, desc: "Laba per pusat" },
]

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Reports" }]} />
      <h1 className="text-2xl font-bold text-foreground">Reports</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportsModules.map((mod) => {
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
