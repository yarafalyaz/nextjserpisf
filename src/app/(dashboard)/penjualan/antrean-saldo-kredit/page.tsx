export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { HandCoins } from "@/components/ui/fontawesome-icons"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerCreditQueueCard } from "@/components/reports/customer-credit-queue-card"
import { CUSTOMER_CREDIT_QUEUE_TITLE } from "@/lib/reports/customer-credit-queue"
import { getCustomerCreditQueue } from "@/lib/reports/customer-credit-queue-data"
import { formatCurrencyExact, formatNumber } from "@/lib/utils/format"

export const metadata: Metadata = { title: CUSTOMER_CREDIT_QUEUE_TITLE }

/**
 * Antrean saldo kredit pelanggan terbuka (F-2026-10-27-083-S, 083-F).
 * Fail-closed `view_sales_invoices` sebelum loader; loader menegakkan
 * ulang gerbang ganda `view_sales_invoices` + `confirm_down_payments`
 * (Q-CCQ-3 belum diputus Lead — gerbang paling ketat usul spec). Saldo,
 * umur, urutan, penanda FP UM, dan rekap dari builder Backend apa
 * adanya — halaman tidak menghitung ulang dan tidak mengurut ulang.
 * Baca-saja: alokasi/refund tetap lewat panel kredit per DP di detail
 * uang muka existing; nol tombol Alokasi/Refund/bayar tahap 1
 * (Q-CCQ-5 belum dibuka Lead).
 */
export default async function CustomerCreditQueuePage() {
  await requirePermission("view_sales_invoices")

  const queue = await getCustomerCreditQueue()
  const { summary, anomaly } = queue
  const totalAnomaly =
    anomaly.openSaldoNol +
    anomaly.selesaiSaldoPositif +
    anomaly.alokasiMelebihiDiterima

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: CUSTOMER_CREDIT_QUEUE_TITLE },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            {CUSTOMER_CREDIT_QUEUE_TITLE}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Monitoring saldo kredit terbuka dan titipan uang muka pelanggan yang siap dialokasikan ke faktur atau menunggu penyelesaian.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/penjualan/uang-muka"
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-11 sm:min-h-9 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
          >
            <HandCoins className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>Kelola Uang Muka</span>
          </Link>
        </div>
      </div>

      {/* KPI Metric Strip Standar ERP Internasional */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Saldo Kredit
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {formatCurrencyExact(summary.totalSaldo)}
            </span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Dokumen Kredit Terbuka
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {formatNumber(summary.jumlahBaris)}
            </span>
            <span className="text-xs text-muted-foreground">dokumen</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Tertahan Faktur Pajak
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
              {formatNumber(summary.jumlahPenandaFpUangMuka)}
            </span>
            <span className="text-xs text-muted-foreground">dokumen</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Integritas Data
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                totalAnomaly > 0
                  ? "text-destructive"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {totalAnomaly > 0 ? formatNumber(totalAnomaly) : "0"}
            </span>
            <span className="text-xs text-muted-foreground">
              {totalAnomaly > 0 ? "anomali warisan" : "bersih (valid)"}
            </span>
          </div>
        </div>
      </div>

      <CustomerCreditQueueCard queue={queue} />
    </div>
  )
}
