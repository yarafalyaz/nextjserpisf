export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SalesOrderDeliveryPromiseQueueCard } from "@/components/reports/sales-order-delivery-promise-queue-card"
import { getSalesOrderDeliveryPromiseQueue } from "@/lib/reports/sales-order-delivery-promise-queue-data"

export const metadata: Metadata = { title: "Antrean Janji Kirim Pesanan Penjualan" }

/**
 * Antrean janji kirim pesanan penjualan (F-2026-10-25-029-S).
 * Fail-closed `view_sales_orders` sebelum loader dipanggil (kontrak
 * Backend, pola antrean-penawaran); ember/sisa hari/nilai/totals dari
 * builder apa adanya — halaman tidak menghitung ulang. Baca-saja total.
 */
export default async function SalesOrderDeliveryPromiseQueuePage() {
  await requirePermission("view_sales_orders")

  const { queue, withoutPromiseCount } = await getSalesOrderDeliveryPromiseQueue()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Antrean Janji Kirim" },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">
        Antrean Janji Kirim Pesanan Penjualan
      </h1>
      <SalesOrderDeliveryPromiseQueueCard
        queue={queue}
        withoutPromiseCount={withoutPromiseCount}
      />
    </div>
  )
}
