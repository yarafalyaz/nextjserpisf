export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { ExternalLink, Receipt } from "@/components/ui/fontawesome-icons"
import { PageHeader } from "@/components/ui/page-header"
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
      <PageHeader
        title="Pencairan Klaim Karyawan"
        subtitle="Daftar pengajuan klaim staf yang telah disetujui dan siap untuk proses pencairan dana kas / transfer bank."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Pencairan Klaim" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/keuangan/pengeluaran"
              className="inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Receipt className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Daftar Pengeluaran</span>
            </Link>
            <Link
              href="/sdm/klaim-reimbursement"
              className="inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <span>Semua Klaim SDM</span>
              <ExternalLink className="size-3 text-muted-foreground" aria-hidden="true" />
            </Link>
          </div>
        }
      />

      <ReimbursementQueueCard queue={queue} />
    </div>
  )
}
