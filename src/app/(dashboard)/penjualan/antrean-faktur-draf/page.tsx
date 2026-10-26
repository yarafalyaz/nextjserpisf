export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SalesInvoiceDraftQueueCard } from "@/components/reports/sales-invoice-draft-queue-card"
import { getSalesInvoiceDraftQueue } from "@/lib/reports/sales-invoice-draft-queue-data"

const TITLE = "Faktur Draft Mengendap"

export const metadata: Metadata = { title: TITLE }

/**
 * Antrean faktur penjualan draft mengendap (F-2026-10-26-057-S, Q-SIQ-5).
 * Fail-closed `view_sales_invoices` sebelum loader dipanggil; tingkat/
 * umur/sumber/rekap dari builder Backend apa adanya — halaman tidak
 * menghitung ulang dan tidak mengurut ulang.
 */
export default async function SalesInvoiceDraftQueuePage() {
  await requirePermission("view_sales_invoices")

  const queue = await getSalesInvoiceDraftQueue()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: TITLE },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">{TITLE}</h1>
      <SalesInvoiceDraftQueueCard
        rows={queue.rows}
        summary={queue.summary}
        noticeText={queue.noticeText}
        levelLabels={queue.levelLabels}
      />
    </div>
  )
}
