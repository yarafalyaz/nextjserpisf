import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  HardDrive, Tag, Layers, ArrowLeftRight
} from "lucide-react"

const assetsModules = [
  { label: "All Assets", href: "/assets", icon: HardDrive, desc: "Semua aset" },
  { label: "Categories", href: "/assets/categories", icon: Tag, desc: "Kategori aset" },
  { label: "Brands", href: "/assets/brands", icon: Layers, desc: "Merek aset" },
  { label: "Transfers", href: "/assets/transfers", icon: ArrowLeftRight, desc: "Transfer aset" },
]

export default function AssetsPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Assets" }]} />
      <h1 className="text-2xl font-bold text-foreground">Assets</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {assetsModules.map((mod) => {
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
