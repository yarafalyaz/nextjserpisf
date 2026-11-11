export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { requirePermission } from "@/lib/auth/permissions"
import { getMaterialRequestQueue } from "@/lib/reports/material-request-data"
import { getMaterialRequestDraftQueue } from "@/lib/reports/material-request-draft-queue-data"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { Plus } from "@/components/ui/fontawesome-icons"
import { MaterialRequestWorkbenchTable } from "./_components/material-request-workbench-table"

export const metadata: Metadata = { title: "Permintaan Antar Gudang" }

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
  const totalDrafts = draftQueue.totalDocuments
  const totalStaleDrafts = draftQueue.levelCounts.mengendap

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Permintaan Antar Gudang" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Permintaan Antar Gudang
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Manajemen permintaan transfer material internal antar gudang dan pabrik.
          </p>
        </div>
        <CanCreate permission="create_material_requests">
          <Link
            href="/inventaris/permintaan-gudang/tambah"
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-11 sm:min-h-9 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="size-3.5" aria-hidden="true" />
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
            Konsep (Draft)
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                totalStaleDrafts > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-foreground"
              }`}
            >
              {totalDrafts}
            </span>
            <span className="text-xs text-muted-foreground">
              {totalStaleDrafts > 0 ? `${totalStaleDrafts} mengendap` : "belum diajukan"}
            </span>
          </div>
        </div>
      </div>

      {/* Unified Enterprise DataTable with Segmented Tabs (termasuk Tab Konsep/Draft) */}
      <MaterialRequestWorkbenchTable
        incoming={queue.incoming}
        outgoing={queue.outgoing}
        draftQueue={draftQueue}
      />
    </div>
  )
}
