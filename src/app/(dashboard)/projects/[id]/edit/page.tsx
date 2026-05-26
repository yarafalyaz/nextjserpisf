export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { ProjectForm } from "@/components/forms/project-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_projects")

  const { id } = await params
  const [project, customers] = await Promise.all([
    prisma.project.findUnique({ where: { id: Number(id) } }),
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  if (!project) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Projects",href:"/projects"},{label:"Edit"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Proyek: {project.name}</h1>
      </div>
      <ProjectForm customers={customers as any} project={{
        ...project,
        startDate: project.startDate?.toISOString().split("T")[0] ?? null,
        endDate: project.endDate?.toISOString().split("T")[0] ?? null,
      }} />
    </div>
  )
}
