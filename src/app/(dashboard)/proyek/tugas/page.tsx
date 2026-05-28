export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { ListTodo } from "lucide-react"
import { AppSearchField } from "@/components/ui/search-field"
import { TaskTable } from "./_components/task-table"
import { statusLabel } from "@/lib/utils/status-labels"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  await requirePermission("view_projects")

  const params = await searchParams

  const where = {
    ...(params.status && { status: params.status }),
    ...(params.search && {
      name: { contains: params.search },
    }),
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      project: true,
      assignee: true,
    },
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(tasks))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Proyek",href:"/proyek"},{label:"Tugas"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tugas Proyek</h1>
        <Link href="/proyek/tugas/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-task-btn">
          <ListTodo size={16} /> Tambah Tugas
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {["", "pending", "in_progress", "completed", "cancelled"].map((s) => (
              <Link key={s} href={`/proyek/tugas?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
          <AppSearchField placeholder="Cari tugas..." action="/proyek/tugas" />
        </div>

        <TaskTable data={tableData} />
      </div>
    </div>
  )
}
