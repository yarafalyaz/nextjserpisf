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
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Plus,
  Truck,
} from "@/components/ui/fontawesome-icons"

export const metadata: Metadata = { title: "Permintaan Antar Gudang" }

function QueueSection({
  title,
  subtitle,
  icon,
  rows,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  rows: MaterialRequestQueueRow[]
}) {
  return (
    <section aria-label={title} className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="p-4 px-5 border-b border-default flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-md bg-muted flex items-center justify-center text-foreground">
            {icon}
          </div>
          <div>
            <h2 className="text-[0.9375rem] font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-muted text-muted-foreground border border-border">
          {rows.length} permintaan
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Tidak ada permintaan" className="py-8" />
      ) : (
        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>No. Dokumen</DetailTableTh>
              <DetailTableTh>Gudang Peminta</DetailTableTh>
              <DetailTableTh>Gudang Penyedia</DetailTableTh>
              <DetailTableTh>Perintah Kerja</DetailTableTh>
              <DetailTableTh>Jatuh Tempo</DetailTableTh>
              <DetailTableTh align="right">Baris</DetailTableTh>
              <DetailTableTh align="right">Transfer Diterima</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((row) => (
                <DetailTableRow key={row.id}>
                  <DetailTableTd>
                    <div className="flex items-center gap-2">
                      <Link
                        href={entityHref("/inventaris/permintaan-gudang", row)}
                        className="font-mono font-medium text-primary hover:underline"
                      >
                        {row.documentNo}
                      </Link>
                      {row.isOverdue && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800">
                          <Clock className="size-2.5" /> Terlambat
                        </span>
                      )}
                    </div>
                  </DetailTableTd>
                  <DetailTableTd>
                    <span className="font-medium text-foreground">{row.requesterWarehouseName}</span>
                  </DetailTableTd>
                  <DetailTableTd>
                    <span className="font-medium text-foreground">{row.sourceWarehouseName}</span>
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.workOrderDocumentNo ? (
                      <span className="font-mono text-xs">{row.workOrderDocumentNo}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.neededBy ? (
                      <span className="font-mono text-xs">{formatDate(row.neededBy)}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    <span className="font-mono tabular-nums">{formatNumber(row.lines.length)}</span>
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    <span className="font-mono tabular-nums font-medium">
                      {formatNumber(row.receivedTransferCount)} / {formatNumber(row.transferCount)}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>
                    <StatusChip status={row.status} customLabel={row.statusLabel} />
                  </DetailTableTd>
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

  const totalIncoming = queue.incoming.length
  const totalOutgoing = queue.outgoing.length
  const totalOverdue = [...queue.incoming, ...queue.outgoing].filter((r) => r.isOverdue).length
  const totalTransfersCompleted = [...queue.incoming, ...queue.outgoing].reduce(
    (acc, r) => acc + (r.receivedTransferCount || 0),
    0
  )

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Inventaris", href: "/inventaris" },
        { label: "Permintaan Antar Gudang" },
      ]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Permintaan Antar Gudang
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manajemen permintaan transfer material internal antar gudang dan pabrik.
          </p>
        </div>
        <CanCreate permission="create_material_requests">
          <Link
            href="/inventaris/permintaan-gudang/tambah"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="size-3.5" />
            <span>Buat Permintaan</span>
          </Link>
        </CanCreate>
      </div>

      {/* KPI Strip Standar ERP */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Permintaan Masuk
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {totalIncoming}
            </span>
            <span className="text-xs text-muted-foreground">menunggu dipenuhi</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Permintaan Keluar
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {totalOutgoing}
            </span>
            <span className="text-xs text-muted-foreground">diajukan ke sumber</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Jatuh Tempo (Overdue)
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                totalOverdue > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"
              }`}
            >
              {totalOverdue}
            </span>
            <span className="text-xs text-muted-foreground">melebihi target</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Transfer Diterima
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {totalTransfersCompleted}
            </span>
            <span className="text-xs text-muted-foreground">batch selesai</span>
          </div>
        </div>
      </div>

      <MaterialRequestDraftQueueCard queue={draftQueue} />

      <QueueSection
        title="Permintaan Masuk"
        subtitle="Daftar permintaan yang meminta stok dari gudang Anda"
        icon={<ArrowDown className="size-4 text-emerald-600 dark:text-emerald-400" />}
        rows={queue.incoming}
      />
      <QueueSection
        title="Permintaan Keluar"
        subtitle="Daftar permintaan yang diajukan oleh gudang Anda ke gudang lain"
        icon={<ArrowUp className="size-4 text-blue-600 dark:text-blue-400" />}
        rows={queue.outgoing}
      />
    </div>
  )
}
