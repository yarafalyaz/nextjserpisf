import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  Package, Wrench, Hammer
} from "lucide-react"

const manufacturingModules = [
  { label: "Products (BOM)", href: "/manufacturing/products", icon: Package, desc: "Bill of Materials" },
  { label: "Work Orders", href: "/manufacturing/work-orders", icon: Wrench, desc: "Perintah kerja" },
  { label: "Production Orders", href: "/manufacturing/production-orders", icon: Hammer, desc: "Perintah produksi" },
]

export default function ManufacturingPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Manufacturing" }]} />
      <h1 className="text-2xl font-bold text-foreground">Manufacturing</h1>
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
                <p className="text-xs text-muted">{mod.desc}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
