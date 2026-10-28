export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
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

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_projects")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
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

  const statusChips = ["", "pending", "in_progress", "completed", "cancelled"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/proyek/tugas${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Proyek",href:"/proyek"},{label:"Tugas"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tugas Proyek</h1>
        <CanCreate permission="create_projects">
          <Link href="/proyek/tugas/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-task-btn">
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
            <AppSearchField placeholder="Cari tugas..." action="/proyek/tugas" />
            <div className="flex gap-1.5 flex-wrap">{statusChips}</div>
          </>
        }
      />
    </div>
  )
}
