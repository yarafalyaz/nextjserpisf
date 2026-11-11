export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { HandCoins } from "@/components/ui/fontawesome-icons"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DownPaymentVerificationQueueCard } from "@/components/reports/down-payment-verification-queue-card"
import { getDownPaymentVerificationQueue } from "@/lib/reports/down-payment-verification-queue-data"
import { DP_QUEUE_TITLE } from "@/lib/reports/down-payment-verification-queue"
import { formatCurrencyExact, formatNumber } from "@/lib/utils/format"

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
  const { summary } = queue

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: DP_QUEUE_TITLE },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            {DP_QUEUE_TITLE}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Verifikasi penerimaan fisik/mutasi rekening atas klaim uang muka pelanggan sebelum pencatatan jurnal kas dan penerbitan faktur penjualan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/penjualan/uang-muka"
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-11 sm:min-h-9 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
          >
            <HandCoins className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>Daftar Uang Muka</span>
          </Link>
        </div>
      </div>

      {/* KPI Metric Strip Standar ERP Internasional */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Menunggu Kas Masuk
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {formatCurrencyExact(summary.totalAmountSen / 100)}
            </span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Antrean Dokumen DP
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {formatNumber(summary.total)}
            </span>
            <span className="text-xs text-muted-foreground">dokumen draf</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Membuka Faktur Penjualan
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-primary">
              {formatNumber(summary.membukaInvoice)}
            </span>
            <span className="text-xs text-muted-foreground">prioritas siap rilis</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Bukti Transfer Belum Ada
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                summary.tanpaBukti > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {formatNumber(summary.tanpaBukti)}
            </span>
            <span className="text-xs text-muted-foreground">
              {summary.tanpaBukti > 0 ? "perlu konfirmasi bukti" : "lengkap"}
            </span>
          </div>
        </div>
      </div>

      <DownPaymentVerificationQueueCard rows={queue.rows} summary={queue.summary} />
    </div>
  )
}
