export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DownPaymentVerificationQueueCard } from "@/components/reports/down-payment-verification-queue-card"
import { getDownPaymentVerificationQueue } from "@/lib/reports/down-payment-verification-queue-data"
import { DP_QUEUE_TITLE } from "@/lib/reports/down-payment-verification-queue"

export const metadata: Metadata = { title: DP_QUEUE_TITLE }

/**
 * Antrean verifikasi DP menunggu konfirmasi (F-2026-10-26-051-S).
 * Fail-closed `view_down_payments` sebelum loader dipanggil; umur,
 * tingkat, jarak ambang, penanda bukti, dan rekap dari builder Backend
 * apa adanya — halaman tidak menghitung ulang dan tidak mengurut ulang.
 * Baca-saja: konfirmasi/tolak tetap lewat detail uang muka existing.
 * Filter status pending = populasi antrean itu sendiri (hanya DP draft
 * dari builder); baris confirmed tidak pernah masuk payload baris.
 */
export default async function DownPaymentVerificationQueuePage() {
  await requirePermission("view_down_payments")

  const queue = await getDownPaymentVerificationQueue()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: DP_QUEUE_TITLE },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">{DP_QUEUE_TITLE}</h1>
      <DownPaymentVerificationQueueCard rows={queue.rows} summary={queue.summary} />
    </div>
  )
}
