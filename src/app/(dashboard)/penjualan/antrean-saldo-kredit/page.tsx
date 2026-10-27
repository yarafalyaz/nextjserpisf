export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerCreditQueueCard } from "@/components/reports/customer-credit-queue-card"
import { CUSTOMER_CREDIT_QUEUE_TITLE } from "@/lib/reports/customer-credit-queue"
import { getCustomerCreditQueue } from "@/lib/reports/customer-credit-queue-data"

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

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: CUSTOMER_CREDIT_QUEUE_TITLE },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">
        {CUSTOMER_CREDIT_QUEUE_TITLE}
      </h1>
      <CustomerCreditQueueCard queue={queue} />
    </div>
  )
}
