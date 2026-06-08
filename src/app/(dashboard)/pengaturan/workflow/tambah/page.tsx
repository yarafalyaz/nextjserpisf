export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { WorkflowForm } from "../_components/workflow-form"

export default async function CreateWorkflowPage() {
  await requirePermission("manage_settings")

  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Alur Persetujuan", href: "/pengaturan/workflow" },
        { label: "Tambah Workflow" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Workflow</h1>
      </div>

      <WorkflowForm roles={roles} />
    </div>
  )
}
