export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { ListTodo } from "lucide-react"
import { AppSearchField } from "@/components/ui/search-field"
import { TaskTable } from "./_components/task-table"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tugas" }

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string }>
}) {
  await requirePermission("view_projects")

  const params = await searchParams
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
    take: 1000,
  })

  const tableData = JSON.parse(JSON.stringify(tasks))

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tugas Proyek</h1>
        <Link href="/proyek/tugas/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-task-btn">
          <ListTodo size={16} /> Tambah Tugas
        </Link>
      </div>

      <TaskTable
        data={tableData}
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
