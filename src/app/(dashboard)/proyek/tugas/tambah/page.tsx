export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TaskForm } from "../_components/task-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Tugas" }

export default async function CreateTaskPage() {
  await requirePermission("view_projects")

  const [projects, employees] = await Promise.all([
    prisma.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employee.findMany({ where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Proyek",href:"/proyek"},{label:"Tugas",href:"/proyek/tugas"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Tugas</h1>
      </div>
      <TaskForm projects={projects} employees={employees} />
    </div>
  )
}
