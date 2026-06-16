import {
  FileText, Wallet, ShoppingCart, Truck, Receipt, CreditCard, RotateCcw
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penjualan" }

const salesModules: ModuleItem[] = [
  { label: "Penawaran", href: "/penjualan/penawaran", icon: FileText, desc: "Penawaran harga" },
  { label: "Uang Muka", href: "/penjualan/uang-muka", icon: Wallet, desc: "Uang muka penjualan" },
  { label: "Pesanan Penjualan", href: "/penjualan/pesanan", icon: ShoppingCart, desc: "Pesanan penjualan" },
  { label: "Surat Jalan", href: "/penjualan/surat-jalan", icon: Truck, desc: "Surat jalan" },
  { label: "Faktur", href: "/penjualan/faktur", icon: Receipt, desc: "Faktur penjualan" },
  { label: "Pembayaran", href: "/penjualan/pembayaran", icon: CreditCard, desc: "Pembayaran masuk" },
  { label: "Retur", href: "/penjualan/retur", icon: RotateCcw, desc: "Retur penjualan" },
]

export default function SalesPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Penjualan" }]} />
      <h1 id="penjualan-heading" className="text-2xl font-bold text-foreground">
        Penjualan
      </h1>
      <ModuleGrid
        ariaLabel="Modul Penjualan"
        headingId="penjualan-heading"
        items={salesModules}
      />
    </div>
  )
}
