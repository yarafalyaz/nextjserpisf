export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { WorkflowForm } from "../../_components/workflow-form"

export default async function EditWorkflowPage({
  params,
}: Readonly<{
  params: Promise<Readonly<{ id: string }>>
}>) {
  await requirePermission("manage_settings")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const [workflow, roles] = await Promise.all([
    prisma.approvalWorkflow.findFirst({
      where: { id: numId, deletedAt: null },
      include: { steps: { orderBy: { stepOrder: "asc" } } },
    }),
    prisma.role.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  if (!workflow) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Alur Persetujuan", href: "/pengaturan/workflow" },
        { label: "Ubah Workflow" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Workflow</h1>
      </div>

      <WorkflowForm
        roles={roles}
        workflow={{
          id: workflow.id,
          name: workflow.name,
          code: workflow.code,
          modelType: workflow.modelType,
          isActive: workflow.isActive,
          steps: workflow.steps.map((s) => ({
            name: s.name,
            roleId: s.roleId,
            approverType: s.approverType,
          })),
        }}
      />
    </div>
  )
}
