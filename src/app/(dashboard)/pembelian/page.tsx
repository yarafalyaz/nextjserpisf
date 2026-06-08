import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  ClipboardList, FileCheck, PackageCheck, FileSpreadsheet, Banknote, Undo2
} from "lucide-react"

const purchaseModules = [
  { label: "Permintaan", href: "/pembelian/permintaan", icon: ClipboardList, desc: "Permintaan pembelian" },
  { label: "Pesanan", href: "/pembelian/pesanan", icon: FileCheck, desc: "Pesanan pembelian" },
  { label: "Penerimaan Barang", href: "/pembelian/penerimaan", icon: PackageCheck, desc: "Penerimaan barang" },
  { label: "Tagihan Vendor", href: "/pembelian/tagihan", icon: FileSpreadsheet, desc: "Tagihan vendor" },
  { label: "Pembayaran Vendor", href: "/pembelian/pembayaran-vendor", icon: Banknote, desc: "Pembayaran ke vendor" },
  { label: "Retur", href: "/pembelian/retur", icon: Undo2, desc: "Retur pembelian" },
]

export default function PurchasePage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pembelian" }]} />
      <h1 className="text-2xl font-bold text-foreground">Pembelian</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {purchaseModules.map((mod) => {
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
