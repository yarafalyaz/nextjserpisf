export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { PurchaseOrderDraftQueueCard } from "@/components/reports/purchase-order-draft-queue-card"
import { PURCHASE_ORDER_DRAFT_QUEUE_TITLE_TEXT } from "@/lib/reports/purchase-order-draft-queue"
import { getPurchaseOrderDraftQueue } from "@/lib/reports/purchase-order-draft-queue-data"

export const metadata: Metadata = { title: PURCHASE_ORDER_DRAFT_QUEUE_TITLE_TEXT }

/**
 * Antrean pesanan pembelian draft mengendap (F-2026-10-26-060-S, 060-F).
 * Fail-closed `view_purchase_orders` sebelum loader dipanggil; loader
 * menegakkan ulang. Tingkat/umur/rekap dari builder Backend apa adanya —
 * halaman tidak menghitung ulang dan tidak mengurut ulang. Baca-saja:
 * setujui/ubah/batal tetap lewat detail pesanan existing (BR-POQ-07).
 */
export default async function PurchaseOrderDraftQueuePage() {
  await requirePermission("view_purchase_orders")

  const queue = await getPurchaseOrderDraftQueue()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: PURCHASE_ORDER_DRAFT_QUEUE_TITLE_TEXT },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">
        {PURCHASE_ORDER_DRAFT_QUEUE_TITLE_TEXT}
      </h1>
      <PurchaseOrderDraftQueueCard queue={queue} />
    </div>
  )
}
