export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { QuotationDraftQueueCard } from "@/components/reports/quotation-draft-queue-card"
import { getQuotationDraftQueue } from "@/lib/reports/quotation-draft-queue-data"
import { filterQuotationDraftQueue } from "@/lib/reports/quotation-draft-queue"

export const metadata: Metadata = { title: "Draf Penawaran Basi" }

/**
 * Antrean draf penawaran basi belum terkirim (F-2026-10-26-055-S, Q-QD-4).
 * Fail-closed `view_quotations` sebelum loader dipanggil; tahap/sisa
 * hari/umur/rekap dari builder Backend apa adanya — halaman tidak
 * menghitung ulang.
 */
export default async function QuotationDraftQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tampilan?: string }>
}) {
  await requirePermission("view_quotations")

  const params = await searchParams
  const mode = params.tampilan === "semua" ? "semua" : "default"

  const queue = await getQuotationDraftQueue()
  const rows = filterQuotationDraftQueue(queue.rows, mode)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Draf Penawaran Basi" },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">
        Draf Penawaran Basi
      </h1>
      <QuotationDraftQueueCard
        rows={rows}
        stageCounts={queue.stageCounts}
        totalDocuments={queue.totalDocuments}
        mode={mode}
      />
    </div>
  )
}
