export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { ListTodo, Plus, Clock, CheckCircle2 } from "@/components/ui/fontawesome-icons"
import { AppSearchField } from "@/components/ui/search-field"
import { TaskTable } from "./_components/task-table"
import {
  PROJECT_TASK_OPEN_QUEUE_TITLE,
} from "@/lib/reports/project-task-queue"
import {
  ProjectTaskMengendapSection,
  ProjectTaskQueueSection,
} from "./_components/project-task-queue"
import { getProjectTaskQueue } from "@/lib/reports/project-task-queue-data"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tugas" }

export const TASK_VALID_URL_STATUSES = ["menunggu", "dalam-proses", "selesai", "batal"] as const
export type TaskUrlStatus = (typeof TASK_VALID_URL_STATUSES)[number]

export interface TasksPageProps {
  statusParam?: string
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderTasksPage({
  statusParam,
  searchParams,
}: TasksPageProps) {
  await requirePermission("view_projects")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/proyek/tugas/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  if (statusParam && !TASK_VALID_URL_STATUSES.includes(statusParam as TaskUrlStatus)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(dbStatus && { status: dbStatus }),
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const [tasks, total, statusGroups, projectTaskQueue] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        project: true,
        assignee: true,
      },
      orderBy: { createdAt: "desc" },
      take,
      skip: (page - 1) * pageSize,
    }),
    prisma.task.count({ where }),
    prisma.task.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    getProjectTaskQueue(),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count?.id ?? 0
    }
  }

  const tableData = toPlain(tasks)

  const statusChips = ["", "pending", "in_progress", "completed", "cancelled"].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus ? `/proyek/tugas/status/${urlStatus}` : "/proyek/tugas"
    const isActive = activeUrlStatus === urlStatus
    const count = dbStatusKey ? (counts[dbStatusKey] ?? 0) : counts.all

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`filter-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          isActive
            ? "border-primary bg-primary/10 text-primary font-semibold"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <span>{dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}</span>
        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
            isActive
              ? "bg-primary text-primary-foreground font-bold"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      </Link>
    )
  })

  const currentActionPath = activeUrlStatus ? `/proyek/tugas/status/${activeUrlStatus}` : "/proyek/tugas"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Proyek", href: "/proyek" },
                { label: "Tugas", href: "/proyek/tugas" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Proyek", href: "/proyek" },
                { label: "Tugas" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Tugas & Aktivitas Proyek (Tasks)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Rincian penugasan teknisi / tim lapangan, pelacakan tenggat waktu, dan progres penyelesaian item pekerjaan.
          </p>
        </div>
        <CanCreate permission="create_projects">
          <Link
            href="/proyek/tugas/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-task-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Tugas</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Tugas
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <ListTodo className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh penugasan terdaftar</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Menunggu Antrean
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.pending}
            </span>
            <Clock className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Belum dimulai penanggung jawab</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Sedang Dikerjakan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-primary font-mono tabular-nums">
              {counts.in_progress}
            </span>
            <ListTodo className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Dalam pengerjaan aktif</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Selesai
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.completed}
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Tugas selesai diverifikasi</span>
        </div>
      </div>

      <section aria-label={PROJECT_TASK_OPEN_QUEUE_TITLE} className="flex flex-col gap-6">
        <ProjectTaskQueueSection queue={projectTaskQueue} />

        <ProjectTaskMengendapSection queue={projectTaskQueue} />
      </section>

      <TaskTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <>
            <AppSearchField placeholder="Cari tugas..." action={currentActionPath} />
            <div className="flex gap-1.5 flex-wrap">{statusChips}</div>
          </>
        }
      />
    </div>
  )
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderTasksPage({ searchParams })
}
