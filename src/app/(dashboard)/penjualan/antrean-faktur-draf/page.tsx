export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SalesInvoiceDraftTable } from "./_components/sales-invoice-draft-table"
import { getSalesInvoiceDraftQueue } from "@/lib/reports/sales-invoice-draft-queue-data"
import { formatCurrencyExact } from "@/lib/utils/format"
import { Receipt } from "@/components/ui/fontawesome-icons"

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
          { label: "Faktur", href: "/penjualan/faktur" },
          { label: TITLE },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            {TITLE}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Pengawasan antrean faktur penjualan berstatus draft yang menunggu verifikasi dan posting buku besar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/penjualan/faktur"
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-11 sm:min-h-9 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
          >
            <Receipt className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>Kembali ke Faktur Penjualan</span>
          </Link>
        </div>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Draft
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {queue.summary.totalDocuments}
            </span>
            <span className="text-xs text-muted-foreground">dokumen</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Draft Mengendap
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                queue.summary.mengendapCount > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-foreground"
              }`}
            >
              {queue.summary.mengendapCount}
            </span>
            <span className="text-xs text-muted-foreground">perlu tindakan</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Menunggu Posting
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
              {queue.summary.menungguCount}
            </span>
            <span className="text-xs text-muted-foreground">dalam proses</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Nilai Belum Terbit
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {formatCurrencyExact(queue.summary.totalGrandTotal)}
            </span>
          </div>
        </div>
      </div>

      <SalesInvoiceDraftTable
        rows={queue.rows}
        summary={queue.summary}
      />
    </div>
  )
}
