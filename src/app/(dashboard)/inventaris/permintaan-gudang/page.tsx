export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { requirePermission } from "@/lib/auth/permissions"
import { getMaterialRequestQueue, type MaterialRequestQueueRow } from "@/lib/reports/material-request-data"
import { getMaterialRequestDraftQueue } from "@/lib/reports/material-request-draft-queue-data"
import { MaterialRequestDraftQueueCard } from "@/components/reports/material-request-draft-queue-card"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { entityHref } from "@/lib/utils/entity-url"

export const metadata: Metadata = { title: "Permintaan Antar Gudang" }

function QueueSection({ title, rows }: { title: string; rows: MaterialRequestQueueRow[] }) {
  return (
    <section aria-label={title} className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Tidak ada permintaan" />
      ) : (
        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>No. Dokumen</DetailTableTh>
              <DetailTableTh>Gudang Tujuan</DetailTableTh>
              <DetailTableTh>Gudang Sumber</DetailTableTh>
              <DetailTableTh>Perintah Kerja</DetailTableTh>
              <DetailTableTh>Tanggal Dibutuhkan</DetailTableTh>
              <DetailTableTh align="right">Baris</DetailTableTh>
              <DetailTableTh align="right">Transfer</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((row) => (
                <DetailTableRow key={row.id}>
                  <DetailTableTd>
                    <Link href={entityHref("/inventaris/permintaan-gudang", row)} className="font-medium text-primary hover:underline">
                      {row.documentNo}
                    </Link>
                    {row.isOverdue && <span className="ml-2 text-xs font-medium text-destructive">Terlambat</span>}
                  </DetailTableTd>
                  <DetailTableTd>{row.requesterWarehouseName}</DetailTableTd>
                  <DetailTableTd>{row.sourceWarehouseName}</DetailTableTd>
                  <DetailTableTd>{row.workOrderDocumentNo ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.neededBy ? formatDate(row.neededBy) : "—"}</DetailTableTd>
                  <DetailTableTd align="right">{formatNumber(row.lines.length)}</DetailTableTd>
                  <DetailTableTd align="right">{formatNumber(row.receivedTransferCount)}/{formatNumber(row.transferCount)}</DetailTableTd>
                  <DetailTableTd><StatusChip status={row.status} customLabel={row.statusLabel} /></DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      )}
    </section>
  )
}

export default async function MaterialRequestsPage() {
  const user = await requirePermission("view_material_requests")
  const queue = await getMaterialRequestQueue(user)
  // 071-F: antrean permintaan material draft mengendap (Backend PR #1108).
  // Halaman menegakkan view_material_requests sebelum loader; loader
  // menegakkan ulang + scope gudang kedua sisi fail-closed.
  const draftQueue = await getMaterialRequestDraftQueue()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Inventaris", href: "/inventaris" },
        { label: "Permintaan Antar Gudang" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Permintaan Antar Gudang</h1>
        <CanCreate permission="create_material_requests">
          <Link href="/inventaris/permintaan-gudang/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
            + Buat Permintaan
          </Link>
        </CanCreate>
      </div>

      <MaterialRequestDraftQueueCard queue={draftQueue} />

      <QueueSection title="Permintaan Masuk" rows={queue.incoming} />
      <QueueSection title="Permintaan Keluar" rows={queue.outgoing} />
    </div>
  )
}
