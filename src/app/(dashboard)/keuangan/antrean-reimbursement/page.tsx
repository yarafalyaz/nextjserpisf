export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ReimbursementQueueCard } from "@/components/reports/reimbursement-queue-card"
import { getReimbursementQueue } from "@/lib/reports/reimbursement-queue-data"
import { REIMBURSEMENT_QUEUE_TITLE } from "@/lib/reports/reimbursement-queue"

export const metadata: Metadata = { title: REIMBURSEMENT_QUEUE_TITLE }

/**
 * Antrean Reimbursement Disetujui — Menunggu Pembayaran (F-2026-10-27-082-S,
 * penempatan Q-RBQ-6: permukaan pengelola di Keuangan).
 * Loader menegakkan `create_employee_reimbursements` + scope SDM fail-closed
 * di server (Q-RBQ-3); tahap/tingkat/umur/total dari builder apa adanya —
 * halaman tidak menghitung ulang (AC-RBQ-F1). Baca-saja tahap 1: tanpa
 * tombol Setujui/Bayar/Tolak (AC-RBQ-F3, BR-RBQ-09).
 */
export default async function ReimbursementQueuePage() {
  const queue = await getReimbursementQueue()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Antrean Reimbursement" },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">{queue.title}</h1>
      <ReimbursementQueueCard queue={queue} />
    </div>
  )
}
