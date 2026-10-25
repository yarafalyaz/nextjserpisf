export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AcceptedQuotationQueueCard } from "@/components/reports/quotation-accepted-queue-card"
import { getAcceptedQuotationQueue } from "@/lib/reports/quotation-accepted-queue-data"

export const metadata: Metadata = { title: "Antrean Penawaran Diterima" }

/**
 * Antrean penawaran diterima belum menjadi pesanan penjualan
 * (F-2026-10-25-002-S). Fail-closed `view_quotations` sebelum loader
 * dipanggil (kontrak Backend); tahap/umur/sisa/fakta dari builder apa
 * adanya — halaman tidak menghitung ulang. Tautan aksi bersyarat izin
 * existing pemanggil (create_sales_orders / create_down_payments).
 */
export default async function AcceptedQuotationQueuePage() {
  await requirePermission("view_quotations")

  const [rows, canCreateSalesOrder, canCreateDownPayment] = await Promise.all([
    getAcceptedQuotationQueue(),
    hasPermission("create_sales_orders"),
    hasPermission("create_down_payments"),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Antrean Penawaran Diterima" },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">
        Antrean Penawaran Diterima
      </h1>
      <AcceptedQuotationQueueCard
        rows={rows}
        canCreateSalesOrder={canCreateSalesOrder}
        canCreateDownPayment={canCreateDownPayment}
      />
    </div>
  )
}
