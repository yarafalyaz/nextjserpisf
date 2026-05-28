export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ReportDateFilter } from "@/components/reports/report-date-filter"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ halaman?: string; modelType?: string }>
}) {
  await requirePermission("manage_settings")

  const params = await searchParams
  const page = Number(params.halaman) || 1
  const perPage = 30

  const where = {
    ...(params.modelType && { modelType: params.modelType }),
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.activityLog.count({ where }),
  ])

  const totalPages = Math.ceil(total / perPage)

  // Get unique model types for filter
  const modelTypes = await prisma.activityLog.findMany({
    select: { modelType: true },
    distinct: ["modelType"],
    orderBy: { modelType: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Settings", href: "/pengaturan" },
  { label: "Activity Log" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Log Aktivitas</h1>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap">
            <Link href="/pengaturan/log-aktivitas" className={`filter-chip ${!params.modelType ? "active" : ""}`}>Semua</Link>
            {modelTypes.map((mt) => (
              <Link key={mt.modelType} href={`/pengaturan/log-aktivitas?tipeModel=${mt.modelType}`} className={`filter-chip ${params.modelType === mt.modelType ? "active" : ""}`}>
                {mt.modelType}
              </Link>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Waktu</DetailTableTh>
              <DetailTableTh>Action</DetailTableTh>
              <DetailTableTh>Model</DetailTableTh>
              <DetailTableTh>ID</DetailTableTh>
              <DetailTableTh>Deskripsi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {logs.length === 0 ? (
                <DetailTableRow><DetailTableTd colSpan={5} className="text-center py-10 text-muted">Belum ada activity log</DetailTableTd></DetailTableRow>
              ) : (
                logs.map((log) => (
                  <DetailTableRow key={log.id}>
                    <DetailTableTd className="whitespace-nowrap">{formatDate(log.createdAt)}</DetailTableTd>
                    <DetailTableTd>
                      <span className={`status-badge ${
                        log.action === "CREATE" ? "status-received" :
                        log.action === "UPDATE" ? "status-posted" :
                        log.action === "DELETE" ? "status-cancelled" : "status-draft"
                      }`}>{log.action}</span>
                    </DetailTableTd>
                    <DetailTableTd className="font-mono">{log.modelType}</DetailTableTd>
                    <DetailTableTd className="font-mono">#{log.modelId}</DetailTableTd>
                    <DetailTableTd>{log.description || "-"}</DetailTableTd>
                  </DetailTableRow>
                ))
              )}
            </DetailTableBody>
          </DetailTable>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 px-5 border-t border-default">
            <span className="text-[0.8125rem] text-muted">Hal {page} dari {totalPages} ({total} data)</span>
            <div className="flex gap-1">
              {page > 1 && <Link href={`/pengaturan/log-aktivitas?halaman=${page - 1}`} className="button button--ghost button--sm">← Sebelumnya</Link>}
              {page < totalPages && <Link href={`/pengaturan/log-aktivitas?halaman=${page + 1}`} className="button button--ghost button--sm">Berikutnya →</Link>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
