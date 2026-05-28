import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  ClipboardList, FileCheck, PackageCheck, FileSpreadsheet, Banknote, Undo2
} from "lucide-react"

const purchaseModules = [
  { label: "Requests", href: "/purchase/requests", icon: ClipboardList, desc: "Permintaan pembelian" },
  { label: "Orders", href: "/purchase/orders", icon: FileCheck, desc: "Pesanan pembelian" },
  { label: "Goods Receipts", href: "/purchase/goods-receipts", icon: PackageCheck, desc: "Penerimaan barang" },
  { label: "Vendor Bills", href: "/purchase/bills", icon: FileSpreadsheet, desc: "Tagihan vendor" },
  { label: "Vendor Payments", href: "/purchase/vendor-payments", icon: Banknote, desc: "Pembayaran ke vendor" },
  { label: "Returns", href: "/purchase/returns", icon: Undo2, desc: "Retur pembelian" },
]

export default function PurchasePage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Purchase" }]} />
      <h1 className="text-2xl font-bold text-foreground">Purchase</h1>
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
                <p className="text-xs text-muted">{mod.desc}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
