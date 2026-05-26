export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ProjectForm } from "@/components/forms/project-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateProjectPage() {
  await requirePermission("view_projects")

  const customers = await prisma.customer.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Projects",href:"/projects"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Proyek</h1>
      </div>
      <ProjectForm customers={customers} />
    </div>
  )
}
