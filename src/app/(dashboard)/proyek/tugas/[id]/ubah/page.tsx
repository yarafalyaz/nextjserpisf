export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TaskForm } from "../../_components/task-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Tugas" }

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_projects")

  const { id } = await params

  const [task, projects, employees] = await Promise.all([
    prisma.task.findUnique({ where: { id: Number(id) } }),
    prisma.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employee.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  if (!task) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Proyek",href:"/proyek"},{label:"Tugas",href:"/proyek/tugas"},{label:"Ubah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Tugas: {task.name}</h1>
      </div>
      <TaskForm
        projects={projects}
        employees={employees}
        task={{
          ...task,
          startDate: task.startDate?.toISOString().split("T")[0] ?? null,
          dueDate: task.dueDate?.toISOString().split("T")[0] ?? null,
        }}
      />
    </div>
  )
}
