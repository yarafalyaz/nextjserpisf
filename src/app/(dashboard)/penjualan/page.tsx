import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  FileText, Wallet, ShoppingCart, Truck, Receipt, CreditCard, RotateCcw
} from "lucide-react"

const salesModules = [
  { label: "Quotations", href: "/penjualan/penawaran", icon: FileText, desc: "Penawaran harga" },
  { label: "Down Payments", href: "/penjualan/uang-muka", icon: Wallet, desc: "Uang muka penjualan" },
  { label: "Sales Orders", href: "/penjualan/pesanan", icon: ShoppingCart, desc: "Pesanan penjualan" },
  { label: "Delivery Orders", href: "/penjualan/surat-jalan", icon: Truck, desc: "Surat jalan" },
  { label: "Invoices", href: "/penjualan/faktur", icon: Receipt, desc: "Faktur penjualan" },
  { label: "Payments", href: "/penjualan/pembayaran", icon: CreditCard, desc: "Pembayaran masuk" },
  { label: "Returns", href: "/penjualan/retur", icon: RotateCcw, desc: "Retur penjualan" },
]

export default function SalesPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Sales" }]} />
      <h1 className="text-2xl font-bold text-foreground">Sales</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {salesModules.map((mod) => {
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
