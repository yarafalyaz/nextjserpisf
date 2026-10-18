export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { WorkflowForm } from "../../_components/workflow-form"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Alur Persetujuan" }

export default async function EditWorkflowPage({
  params,
}: Readonly<{
  params: Promise<Readonly<{ slug: string }>>
}>) {
  await requirePermission("manage_settings")

  const { slug } = await params

  const [workflow, roles] = await Promise.all([
    resolveEntity(
      { segment: slug, fallbackWhere: { deletedAt: null } },
      {
        bySlug: (s, where) => prisma.approvalWorkflow.findFirst({
          where: { slug: s, ...where },
          include: { steps: { orderBy: { stepOrder: "asc" } } },
        }),
        byId: (id, where) => prisma.approvalWorkflow.findFirst({
          where: { id, ...where },
          include: { steps: { orderBy: { stepOrder: "asc" } } },
        }),
      },
    ),
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
        { label: "Ubah Alur Persetujuan" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Alur Persetujuan</h1>
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
