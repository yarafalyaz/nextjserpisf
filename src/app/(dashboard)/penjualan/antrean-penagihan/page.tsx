export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { hasPermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CollectionQueueTable } from "./_components/collection-queue-table"
import { getCollectionQueue } from "@/lib/reports/collection-queue-data"
import { COLLECTION_QUEUE_TITLE } from "@/lib/reports/collection-queue"
import { formatCurrencyExact } from "@/lib/utils/format"
import { HandCoins } from "@/components/ui/fontawesome-icons"
import { prisma } from "@/lib/db/prisma"

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

  const customerIds = [...new Set(queue.rows.map((r) => r.customerId))]
  const invoiceIds = [...new Set(queue.rows.map((r) => r.invoiceId))]

  const [customerRows, invoiceRows] = await Promise.all([
    customerIds.length === 0
      ? []
      : prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, slug: true },
        }),
    invoiceIds.length === 0
      ? []
      : prisma.salesInvoice.findMany({
          where: { id: { in: invoiceIds } },
          select: { id: true, slug: true },
        }),
  ])

  const customerSlugMap = Object.fromEntries(
    customerRows.map((c) => [c.id, c.slug ?? String(c.id)]),
  )
  const invoiceSlugMap = Object.fromEntries(
    invoiceRows.map((i) => [i.id, i.slug ?? String(i.id)]),
  )

  const criticalCount =
    queue.summary.reminderLevels.eskalasi.count +
    queue.summary.reminderLevels.pengingat_lanjutan.count

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Faktur Penjualan", href: "/penjualan/faktur" },
          { label: COLLECTION_QUEUE_TITLE },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            {COLLECTION_QUEUE_TITLE}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Monitoring penagihan piutang pelanggan, jadwal jatuh tempo, dan eskalasi tindakan pengingat pembayaran.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/penjualan/faktur"
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-11 sm:min-h-9 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
          >
            <HandCoins className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>Daftar Faktur Penjualan</span>
          </Link>
        </div>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Piutang Tertagih
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {queue.summary.total}
            </span>
            <span className="text-xs text-muted-foreground">faktur terbuka</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Sisa Tagihan
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {formatCurrencyExact(queue.summary.totalSisa)}
            </span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Perlu Eskalasi &amp; Pengingat
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                criticalCount > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-foreground"
              }`}
            >
              {criticalCount}
            </span>
            <span className="text-xs text-muted-foreground">
              {queue.summary.reminderLevels.eskalasi.count > 0
                ? `${queue.summary.reminderLevels.eskalasi.count} eskalasi kritis`
                : "dalam kontrol"}
            </span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Lewat Janji Bayar
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                queue.summary.lewatJanji > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-foreground"
              }`}
            >
              {queue.summary.lewatJanji}
            </span>
            <span className="text-xs text-muted-foreground">faktur cidera janji</span>
          </div>
        </div>
      </div>

      <CollectionQueueTable
        rows={queue.rows}
        summary={queue.summary}
        canCreateExchange={canCreateExchange}
        canFollowUp={canFollowUp}
        customerSlugMap={customerSlugMap}
        invoiceSlugMap={invoiceSlugMap}
      />
    </div>
  )
}
