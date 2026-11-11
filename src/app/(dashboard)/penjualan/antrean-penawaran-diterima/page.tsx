export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AcceptedQuotationTable } from "./_components/accepted-quotation-table"
import { getAcceptedQuotationQueue } from "@/lib/reports/quotation-accepted-queue-data"
import { formatCurrencyExact } from "@/lib/utils/format"
import { FileText } from "@/components/ui/fontawesome-icons"

export const metadata: Metadata = { title: "Antrean Penawaran Diterima" }

/**
 * Antrean penawaran diterima belum menjadi pesanan penjualan
 * (F-2026-10-25-002-S). Fail-closed `view_quotations` sebelum loader
 * dipanggil (kontrak Backend); tahap/umur/sisa/fakta dari builder apa
 * adanya — halaman tidak menghitung ulang. Tautan aksi bersyarat izin
 * existing pemanggil (create_sales_orders / create_down_payments).
 */
export default async function AcceptedQuotationQueuePage() {
  await requirePermission("view_quotations")

  const [rows, canCreateSalesOrder, canCreateDownPayment] = await Promise.all([
    getAcceptedQuotationQueue(),
    hasPermission("create_sales_orders"),
    hasPermission("create_down_payments"),
  ])

  // Hitung KPI Eksekutif
  const totalGrandTotal = rows.reduce((acc, r) => acc + r.grandTotal, 0)
  const staleCount = rows.filter((r) => r.tahap === "MENGENDAP").length
  const expiredCount = rows.filter((r) => r.tahap === "MASA_BERLAKU_LEWAT").length
  const waitingCount = rows.filter((r) => r.tahap === "MENUNGGU_TINDAK_LANJUT").length

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Penawaran Harga", href: "/penjualan/penawaran" },
          { label: "Antrean Penawaran Diterima" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Antrean Penawaran Diterima
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Pengawasan penawaran harga yang sudah disetujui pelanggan dan siap dikonversi menjadi Pesanan Penjualan (SO).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/penjualan/penawaran"
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-11 sm:min-h-9 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
          >
            <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>Kembali ke Penawaran</span>
          </Link>
        </div>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Diterima
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {rows.length}
            </span>
            <span className="text-xs text-muted-foreground">penawaran</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Siap Dikonversi (SO)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-blue-600 dark:text-blue-400">
              {waitingCount}
            </span>
            <span className="text-xs text-muted-foreground">menunggu tindak lanjut</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Mengendap (&gt;3 Hari)
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                staleCount > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-foreground"
              }`}
            >
              {staleCount}
            </span>
            <span className="text-xs text-muted-foreground">
              {expiredCount > 0 ? `+ ${expiredCount} lewat tempo` : "perlu difollow-up"}
            </span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Potensi Nilai SO
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {formatCurrencyExact(totalGrandTotal)}
            </span>
          </div>
        </div>
      </div>

      <AcceptedQuotationTable
        rows={rows}
        canCreateSalesOrder={canCreateSalesOrder}
        canCreateDownPayment={canCreateDownPayment}
      />
    </div>
  )
}
