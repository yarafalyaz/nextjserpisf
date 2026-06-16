import {
  BarChart3, Scale, ArrowLeftRight, Wrench, Grid3X3
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Inventaris" }

const inventoryModules: ModuleItem[] = [
  { label: "Mutasi Stok", href: "/inventaris/mutasi-stok", icon: BarChart3, desc: "Pergerakan stok" },
  { label: "Penyesuaian", href: "/inventaris/penyesuaian", icon: Scale, desc: "Penyesuaian stok" },
  { label: "Transfer", href: "/inventaris/transfer", icon: ArrowLeftRight, desc: "Transfer antar gudang" },
  { label: "Pengeluaran Material", href: "/inventaris/pengeluaran-material", icon: Wrench, desc: "Pengeluaran material" },
  { label: "Rak", href: "/inventaris/rak", icon: Grid3X3, desc: "Kelola rak gudang" },
]

export default function InventoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Inventaris" }]} />
      <h1 id="inventaris-heading" className="text-2xl font-bold text-foreground">
        Inventaris
      </h1>
      <ModuleGrid
        ariaLabel="Modul Inventaris"
        headingId="inventaris-heading"
        items={inventoryModules}
      />
    </div>
  )
}
