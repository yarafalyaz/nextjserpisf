import {
  Package, Wrench, Hammer
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Manufaktur" }

const manufacturingModules: ModuleItem[] = [
  { label: "Produk (BOM)", href: "/produksi/products", icon: Package, desc: "Bill of Materials" },
  { label: "Perintah Kerja", href: "/produksi/perintah-kerja", icon: Wrench, desc: "Perintah kerja" },
  { label: "Perintah Produksi", href: "/produksi/production-orders", icon: Hammer, desc: "Perintah produksi" },
]

export default function ManufacturingPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Manufaktur" }]} />
      <h1 id="manufaktur-heading" className="text-2xl font-bold text-foreground">
        Manufaktur
      </h1>
      <ModuleGrid
        ariaLabel="Modul Manufaktur"
        headingId="manufaktur-heading"
        items={manufacturingModules}
      />
    </div>
  )
}
