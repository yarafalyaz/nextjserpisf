export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { StatsCards } from "@/components/activity-log/stats-cards"
import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { buildPathFilterHref, parsePathFilterSegments } from "@/lib/utils/path-filters"
import { ActivityLogController } from "../_components/activity-log-controller"
import { ClearLogButton } from "../_components/clear-log-button"
import { resolveActivityReferenceLabels } from "@/lib/services/activity-reference.service"
import { applyReferenceLabel, isTrackedActivityReference } from "@/lib/utils/activity-href"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Log Aktivitas" }

export default async function ActivityLogPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{
    cari?: string
    halaman?: string
    pageSize?: string
    userId?: string
    action?: string
    modelType?: string
    dateFrom?: string
    dateTo?: string
  }>
}) {
  await requirePermission("manage_settings")

  const sp = await searchParams

  // Tautan lama `?dateFrom=&dateTo=` diarahkan ke pasangan path (filter
  // lain dipertahankan sebagai query, halaman dibuang).
  if (sp.dateFrom || sp.dateTo) {
    const legacyPath = buildPathFilterHref("/pengaturan/log-aktivitas", {
      dari: sp.dateFrom,
      sampai: sp.dateTo,
    })
    const legacy = new URLSearchParams()
    for (const key of ["cari", "userId", "action", "modelType", "pageSize"] as const) {
      if (sp[key]) legacy.set(key, sp[key])
    }
    const legacyQuery = legacy.toString()
    redirect(legacyQuery ? `${legacyPath}?${legacyQuery}` : legacyPath)
  }

  const { segments } = await routeParams
  const filters = parsePathFilterSegments(segments, {
    dari: /^\d{4}-\d{2}-\d{2}$/,
    sampai: /^\d{4}-\d{2}-\d{2}$/,
  })
  if (!filters) notFound()

  const { page, pageSize, skip, take } = parsePagination(sp)

  // Build where clause
  const where: Record<string, unknown> = {}

  if (sp.userId && sp.userId !== "all") {
    where.userId = Number.parseInt(sp.userId, 10)
  }
  if (sp.action && sp.action !== "all") {
    where.action = sp.action
  }
  if (sp.modelType && sp.modelType !== "all") {
    where.modelType = sp.modelType
  }
  if (filters.dari || filters.sampai) {
    where.createdAt = {}
    const w = where.createdAt as Record<string, Date>
    if (filters.dari) w.gte = new Date(filters.dari)
    if (filters.sampai) {
      const d = new Date(filters.sampai)
      d.setHours(23, 59, 59, 999)
      w.lte = d
    }
  }
  if (sp.cari) {
    where.description = { contains: sp.cari }
  }

  // Date range for stats (default: current month)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)

  const [logs, total, users, modelTypes, actions, statsToday, statsMonth, activeUsersCount] =
    await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        select: { userId: true },
        distinct: ["userId"],
        orderBy: { createdAt: "desc" },
      }).then((rows) =>
        Promise.all(
          rows
            .filter((r) => r.userId != null)
            .map((r) =>
              prisma.user.findUnique({
                where: { id: r.userId! },
                select: { id: true, name: true },
              }),
            ),
        ).then((users) =>
          users.filter((u): u is { id: number; name: string } => u != null),
        ),
      ),
      prisma.activityLog.findMany({
        select: { modelType: true },
        distinct: ["modelType"],
        orderBy: { modelType: "asc" },
      }),
      prisma.activityLog.findMany({
        select: { action: true },
        distinct: ["action"],
        orderBy: { action: "asc" },
      }),
      // Stats: today
      prisma.activityLog.count({
        where: { createdAt: { gte: todayStart } },
      }),
      // Stats: this month
      prisma.activityLog.count({
        where: { createdAt: { gte: monthStart } },
      }),
      // Active users (7 days)
      prisma.activityLog.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { userId: true },
        distinct: ["userId"],
      }).then((r) => r.filter((x) => x.userId != null).length),
    ])

  // Hydrate user names for rows
  const rowUserIds = Array.from(
    new Set(logs.map((l) => l.userId).filter((id): id is number => id != null)),
  )
  const rowUsers = rowUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: rowUserIds } },
        select: { id: true, name: true },
      })
    : []
  const rowUserMap = new Map(rowUsers.map((u) => [u.id, u.name]))

  // Label manusiawi (nomor dokumen / kode / nama) untuk entitas yang dirujuk
  // baris di halaman ini — satu query per tipe model, bukan per baris.
  const refLabels = await resolveActivityReferenceLabels(
    logs.map((log) => ({ modelType: log.modelType, modelId: log.modelId })),
  )

  const rows = logs.map((log) => {
    const refLabel =
      log.modelId != null ? (refLabels.get(`${log.modelType}:${log.modelId}`) ?? null) : null
    // Jenis entitas yang labelnya seharusnya bisa diresolusi tetapi tidak ketemu
    // berarti recordnya sudah dihapus — tandai agar id mentah tidak terbaca
    // sebagai kesalahan tampilan.
    const refMissing =
      refLabel === null && log.modelId != null && isTrackedActivityReference(log.modelType)
    return {
      id: log.id,
      userId: log.userId,
      userName: log.userId ? (rowUserMap.get(log.userId) ?? "Pengguna") : "Sistem",
      action: log.action,
      modelType: log.modelType,
      modelId: log.modelId,
      refLabel,
      refMissing,
      // Deskripsi menyematkan id mentah ("… #16"); tampilkan nomor dokumennya
      // supaya entri log jelas dibaca.
      description: applyReferenceLabel(log.description ?? "-", log.modelId, refLabel),
      createdAt: log.createdAt.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      ipAddress: log.ipAddress ?? "-",
      oldValues: log.oldValues,
      newValues: log.newValues,
    }
  })

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Log Aktivitas" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Log Aktivitas</h1>
          <p className="text-sm text-muted-foreground">
            Riwayat semua perubahan data di sistem
          </p>
        </div>
        <ClearLogButton />
      </div>

      <StatsCards
        stats={[
          {
            label: "Hari ini",
            value: statsToday,
            tone: statsToday > 0 ? "good" : "default",
          },
          {
            label: "Bulan ini",
            value: statsMonth,
            tone: statsMonth > 100 ? "warn" : "default",
          },
          {
            label: "Pengguna aktif (7 hari)",
            value: activeUsersCount,
            tone: activeUsersCount > 0 ? "good" : "default",
          },
          {
            label: "Jumlah Data",
            value: total.toLocaleString("id-ID"),
            hint: `${modelTypes.length} model dilacak`,
          },
        ]}
      />

      <div className="flex flex-col gap-3">
        <Suspense>
          <ActivityLogController
            data={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            users={users}
            modelTypes={modelTypes.map((m) => m.modelType)}
            actions={actions.map((a) => a.action)}
            filterUser={sp.userId ?? "all"}
            filterAction={sp.action ?? "all"}
            filterModel={sp.modelType ?? "all"}
            filterDateFrom={filters.dari ?? ""}
            filterDateTo={filters.sampai ?? ""}
          />
        </Suspense>
      </div>
    </div>
  )
}
