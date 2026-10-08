import {
  FileText, Wallet, ShoppingCart, Truck, Receipt, CreditCard, RotateCcw
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penjualan" }

const salesModules: ModuleItem[] = [
  { label: "Penawaran", href: "/penjualan/penawaran", icon: FileText, desc: "Penawaran harga", permission: "view_quotations" },
  { label: "Uang Muka", href: "/penjualan/uang-muka", icon: Wallet, desc: "Uang muka penjualan", permission: "view_down_payments" },
  { label: "Pesanan Penjualan", href: "/penjualan/pesanan", icon: ShoppingCart, desc: "Pesanan penjualan", permission: "view_sales_orders" },
  { label: "Surat Jalan", href: "/penjualan/surat-jalan", icon: Truck, desc: "Surat jalan", permission: "view_delivery_orders" },
  { label: "Faktur", href: "/penjualan/faktur", icon: Receipt, desc: "Faktur penjualan", permission: "view_sales_invoices" },
  { label: "Pembayaran", href: "/penjualan/pembayaran", icon: CreditCard, desc: "Pembayaran masuk", permission: "view_sales_payments" },
  { label: "Retur", href: "/penjualan/retur", icon: RotateCcw, desc: "Retur penjualan", permission: "view_sales_returns" },
]

const SALES_PERMISSIONS = [
  "view_quotations",
  "view_down_payments",
  "view_sales_orders",
  "view_delivery_orders",
  "view_sales_invoices",
  "view_sales_payments",
  "view_sales_returns",
]

export default async function SalesPage() {
  const user = await requireAnyPermission(SALES_PERMISSIONS)
  const isSuperAdmin = user.roles.includes("super_admin")

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
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}
