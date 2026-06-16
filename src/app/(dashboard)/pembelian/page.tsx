import {
  ClipboardList, FileCheck, PackageCheck, FileSpreadsheet, Banknote, Undo2
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pembelian" }

const purchaseModules: ModuleItem[] = [
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
      <h1 id="pembelian-heading" className="text-2xl font-bold text-foreground">
        Pembelian
      </h1>
      <ModuleGrid
        ariaLabel="Modul Pembelian"
        headingId="pembelian-heading"
        items={purchaseModules}
      />
    </div>
  )
}
