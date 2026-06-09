import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  Package, Wrench, Hammer
} from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Produksi" }


const manufacturingModules = [
  { label: "Produk (BOM)", href: "/produksi/products", icon: Package, desc: "Bill of Materials" },
  { label: "Perintah Kerja", href: "/produksi/perintah-kerja", icon: Wrench, desc: "Perintah kerja" },
  { label: "Perintah Produksi", href: "/produksi/production-orders", icon: Hammer, desc: "Perintah produksi" },
]

export default function ManufacturingPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Manufaktur" }]} />
      <h1 className="text-2xl font-bold text-foreground">Manufaktur</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {manufacturingModules.map((mod) => {
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
