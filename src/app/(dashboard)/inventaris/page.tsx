import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  BarChart3, Scale, ArrowLeftRight, Wrench, Grid3X3
} from "lucide-react"

const inventoryModules = [
  { label: "Stock Moves", href: "/inventaris/mutasi-stok", icon: BarChart3, desc: "Pergerakan stok" },
  { label: "Adjustments", href: "/inventaris/penyesuaian", icon: Scale, desc: "Penyesuaian stok" },
  { label: "Transfers", href: "/inventaris/transfer", icon: ArrowLeftRight, desc: "Transfer antar gudang" },
  { label: "Material Issues", href: "/inventaris/pengeluaran-material", icon: Wrench, desc: "Pengeluaran material" },
  { label: "Racks", href: "/inventaris/rak", icon: Grid3X3, desc: "Kelola rak gudang" },
]

export default function InventoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Inventory" }]} />
      <h1 className="text-2xl font-bold text-foreground">Inventaris</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {inventoryModules.map((mod) => {
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
