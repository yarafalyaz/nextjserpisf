export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { WorkflowTable } from "./_components/workflow-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Workflow" }

export default async function WorkflowPage() {
  await requirePermission("manage_settings")

  const workflows = await prisma.approvalWorkflow.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      modelType: true,
      isActive: true,
      _count: { select: { steps: true } },
    },
  })

  const data = workflows.map((wf) => ({
    id: wf.id,
    name: wf.name,
    modelType: wf.modelType,
    stepCount: wf._count.steps,
    isActive: wf.isActive,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Alur Persetujuan" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Alur Persetujuan (Workflow)</h1>
        <Link
          href="/pengaturan/workflow/tambah"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
        >
          + Tambah Workflow
        </Link>
      </div>

      <WorkflowTable data={data} />
    </div>
  )
}
