import {
  ClipboardList, FileCheck, PackageCheck, FileSpreadsheet, Banknote, Undo2
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pembelian" }

const purchaseModules: ModuleItem[] = [
  { label: "Permintaan", href: "/pembelian/permintaan", icon: ClipboardList, desc: "Permintaan pembelian", permission: "view_purchase_requests" },
  { label: "Pesanan", href: "/pembelian/pesanan", icon: FileCheck, desc: "Pesanan pembelian", permission: "view_purchase_orders" },
  { label: "Penerimaan Barang", href: "/pembelian/penerimaan", icon: PackageCheck, desc: "Penerimaan barang", permission: "view_goods_receipts" },
  { label: "Tagihan Vendor", href: "/pembelian/tagihan", icon: FileSpreadsheet, desc: "Tagihan vendor", permission: "view_vendor_bills" },
  { label: "Pembayaran Vendor", href: "/pembelian/pembayaran-vendor", icon: Banknote, desc: "Pembayaran ke vendor", permission: "view_vendor_payments" },
  { label: "Retur", href: "/pembelian/retur", icon: Undo2, desc: "Retur pembelian", permission: "view_purchase_returns" },
]

const PURCHASE_PERMISSIONS = [
  "view_purchase_requests",
  "view_purchase_orders",
  "view_goods_receipts",
  "view_vendor_bills",
  "view_vendor_payments",
  "view_purchase_returns",
]

export default async function PurchasePage() {
  const user = await requireAnyPermission(PURCHASE_PERMISSIONS)
  const isSuperAdmin = user.roles.includes("super_admin")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pembelian" }]} />
      <h1 id="pembelian-heading" className="text-2xl font-bold text-foreground">
        Pembelian
      </h1>
      <ModuleGrid
        ariaLabel="Modul Pembelian"
        headingId="pembelian-heading"
        items={purchaseModules}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}
