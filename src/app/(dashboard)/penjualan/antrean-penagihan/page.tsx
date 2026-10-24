export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { hasPermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CollectionQueueCard } from "@/components/reports/collection-queue-card"
import { getCollectionQueue } from "@/lib/reports/collection-queue-data"
import { COLLECTION_QUEUE_TITLE } from "@/lib/reports/collection-queue"

export const metadata: Metadata = { title: COLLECTION_QUEUE_TITLE }

/**
 * Antrean Penagihan Piutang (F-2026-10-22-089-S, rute Q-COL-3).
 * Loader menegakkan `view_reports` AND `view_sales_invoices` fail-closed
 * di server; tahap/sisa/umur dari builder apa adanya — halaman tidak
 * menghitung ulang (AC-COL-10). Tombol bersyarat izin halaman ini.
 */
export default async function CollectionQueuePage() {
  const [queue, canCreateExchange, canFollowUp] = await Promise.all([
    getCollectionQueue(),
    hasPermission("create_invoice_exchanges"),
    hasPermission("create_invoice_collection_followups"),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Antrean Penagihan" },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">
        {COLLECTION_QUEUE_TITLE}
      </h1>
      <CollectionQueueCard
        rows={queue.rows}
        summary={queue.summary}
        canCreateExchange={canCreateExchange}
        canFollowUp={canFollowUp}
      />
    </div>
  )
}
