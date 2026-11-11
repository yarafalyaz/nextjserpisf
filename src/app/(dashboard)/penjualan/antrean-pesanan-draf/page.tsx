export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SalesOrderDraftQueueCard } from "@/components/reports/sales-order-draft-queue-card"
import { getSalesOrderDraftQueue } from "@/lib/reports/sales-order-draft-queue-data"
import { SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT } from "@/lib/reports/sales-order-draft-queue"
import { formatCurrencyExact } from "@/lib/utils/format"
import { ShoppingCart } from "@/components/ui/fontawesome-icons"

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
          { label: "Pesanan Penjualan", href: "/penjualan/pesanan" },
          { label: SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            {SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Pengawasan antrean pesanan penjualan berstatus draft/konsep yang menunggu persetujuan dan verifikasi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/penjualan/pesanan"
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-11 sm:min-h-9 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
          >
            <ShoppingCart className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>Kembali ke Pesanan Penjualan</span>
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
              {queue.totalDocuments}
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
                queue.levelCounts.mengendap > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-foreground"
              }`}
            >
              {queue.levelCounts.mengendap}
            </span>
            <span className="text-xs text-muted-foreground">perlu tindakan</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Menunggu Persetujuan
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
              {queue.levelCounts.menunggu}
            </span>
            <span className="text-xs text-muted-foreground">dalam proses</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Nilai Belum Disetujui
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {formatCurrencyExact(queue.totalGrandTotal)}
            </span>
          </div>
        </div>
      </div>

      <SalesOrderDraftQueueCard
        rows={queue.rows}
        levelCounts={queue.levelCounts}
        totalDocuments={queue.totalDocuments}
        totalGrandTotal={queue.totalGrandTotal}
      />
    </div>
  )
}
