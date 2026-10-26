export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SalesOrderDraftQueueCard } from "@/components/reports/sales-order-draft-queue-card"
import { getSalesOrderDraftQueue } from "@/lib/reports/sales-order-draft-queue-data"
import { SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT } from "@/lib/reports/sales-order-draft-queue"

export const metadata: Metadata = { title: SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT }

/**
 * Antrean pesanan penjualan draft mengendap (F-2026-10-26-056-S, Q-SOQ-4/5).
 * Fail-closed `view_sales_orders` sebelum loader dipanggil; tingkat/umur/
 * janji/asal/rekap dari builder Backend apa adanya — halaman tidak
 * menghitung ulang dan tidak mengurut ulang.
 */
export default async function SalesOrderDraftQueuePage() {
  await requirePermission("view_sales_orders")

  const queue = await getSalesOrderDraftQueue()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">
        {SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT}
      </h1>
      <SalesOrderDraftQueueCard
        rows={queue.rows}
        levelCounts={queue.levelCounts}
        totalDocuments={queue.totalDocuments}
        totalGrandTotal={queue.totalGrandTotal}
      />
    </div>
  )
}
