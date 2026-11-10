export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { ListTodo } from "lucide-react"
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

  const tasks = await prisma.task.findMany({
    where,
    include: {
      project: true,
      assignee: true,
    },
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.task.count({ where })

  // Seksi turunan baca-saja (F-2026-10-27-091-S, Q-PTQ-4 +
  // F-2026-10-27-102-S, Q-TSQ-3): satu permukaan gabungan
  // PROJECT_TASK_OPEN_QUEUE_TITLE berisi dua seksi — Lewat Tenggat
  // (091-S) lalu Mengendap (102-S). Gerbang view_projects ditegakkan
  // ulang fail-closed di loader sebelum query. Daftar existing di
  // bawah tidak diubah urutan/batasnya.
  const projectTaskQueue = await getProjectTaskQueue()

  const tableData = toPlain(tasks)

  const statusChips = ["", "pending", "in_progress", "completed", "cancelled"].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus ? `/proyek/tugas/status/${urlStatus}` : "/proyek/tugas"
    const isActive = activeUrlStatus === urlStatus

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`filter-chip ${isActive ? "active" : ""}`}
      >
        {dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tugas Proyek</h1>
        <CanCreate permission="create_projects">
          <Link
            href="/proyek/tugas/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-task-btn"
          >
            <ListTodo size={16} /> Tambah Tugas
          </Link>
        </CanCreate>
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
