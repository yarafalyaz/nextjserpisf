export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; modelType?: string }>
}) {
  await requirePermission("manage_settings")

  const params = await searchParams
  const page = Number(params.page) || 1
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
  { label: "Settings", href: "/settings" },
  { label: "Activity Log" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Activity Log</h1>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap">
            <Link href="/settings/activity-log" className={`filter-chip ${!params.modelType ? "active" : ""}`}>Semua</Link>
            {modelTypes.map((mt) => (
              <Link key={mt.modelType} href={`/settings/activity-log?modelType=${mt.modelType}`} className={`filter-chip ${params.modelType === mt.modelType ? "active" : ""}`}>
                {mt.modelType}
              </Link>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Action</th>
                <th>Model</th>
                <th>ID</th>
                <th>Deskripsi</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 px-4 text-muted">Belum ada activity log</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(log.createdAt)}</td>
                    <td>
                      <span className={`status-badge ${
                        log.action === "CREATE" ? "status-received" :
                        log.action === "UPDATE" ? "status-posted" :
                        log.action === "DELETE" ? "status-cancelled" : "status-draft"
                      }`}>{log.action}</span>
                    </td>
                    <td className="font-mono">{log.modelType}</td>
                    <td className="font-mono">#{log.modelId}</td>
                    <td>{log.description || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 px-5 border-t border-default">
            <span className="text-[0.8125rem] text-muted">Hal {page} dari {totalPages} ({total} data)</span>
            <div className="flex gap-1">
              {page > 1 && <Link href={`/settings/activity-log?page=${page - 1}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost">← Prev</Link>}
              {page < totalPages && <Link href={`/settings/activity-log?page=${page + 1}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost">Next →</Link>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
