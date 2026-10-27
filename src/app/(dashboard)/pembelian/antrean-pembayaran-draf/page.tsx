export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  VendorPaymentDraftQueueCard,
  VENDOR_PAYMENT_DRAFT_QUEUE_TITLE,
} from "@/components/reports/vendor-payment-draft-queue-card"
import { getVendorPaymentDraftQueue } from "@/lib/reports/vendor-payment-draft-queue-data"

export const metadata: Metadata = { title: VENDOR_PAYMENT_DRAFT_QUEUE_TITLE }

/**
 * Antrean pembayaran vendor draft mengendap (F-2026-10-26-072-S, 072-F).
 * Fail-closed `view_vendor_payments` sebelum loader dipanggil; loader
 * menegakkan ulang. Tingkat/umur/rekap dari builder Backend apa adanya —
 * halaman tidak menghitung ulang dan tidak mengurut ulang.
 */
export default async function VendorPaymentDraftQueuePage() {
  await requirePermission("view_vendor_payments")

  const queue = await getVendorPaymentDraftQueue()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: VENDOR_PAYMENT_DRAFT_QUEUE_TITLE },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">{VENDOR_PAYMENT_DRAFT_QUEUE_TITLE}</h1>
      <VendorPaymentDraftQueueCard queue={queue} />
    </div>
  )
}
