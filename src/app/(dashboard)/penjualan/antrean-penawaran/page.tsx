export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { QuotationFollowUpQueueCard } from "@/components/reports/quotation-followup-queue-card"
import { getQuotationFollowUpQueue } from "@/lib/reports/quotation-followup-queue-data"
import { filterQuotationFollowUpQueue } from "@/lib/reports/quotation-followup-queue"
import { buildQuotationFollowUpCsv } from "@/lib/reports/quotation-followup-export"

export const metadata: Metadata = { title: "Antrean Penawaran Belum Dijawab" }

/**
 * Antrean penawaran terkirim belum dijawab (F-2026-10-22-091-S).
 * Fail-closed `view_quotations` sebelum loader dipanggil; tahap/sisa
 * hari dari builder BOT 3 apa adanya — halaman tidak menghitung ulang.
 * Rute usulan spec Q-QF-3 di grup Penjualan (pemilik izin quotations),
 * putusan rute final BOT 1.
 */
export default async function QuotationFollowUpQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tampilan?: string }>
}) {
  await requirePermission("view_quotations")

  const params = await searchParams
  const mode = params.tampilan === "semua" ? "semua" : "default"

  const allRows = await getQuotationFollowUpQueue()
  const rows = filterQuotationFollowUpQueue(allRows, mode)
  const csv = buildQuotationFollowUpCsv(rows)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Antrean Penawaran" },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">
        Antrean Penawaran Belum Dijawab
      </h1>
      <QuotationFollowUpQueueCard rows={rows} mode={mode} csv={csv} />
    </div>
  )
}
