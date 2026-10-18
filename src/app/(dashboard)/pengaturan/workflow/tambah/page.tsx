export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { WorkflowForm } from "../_components/workflow-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Alur Persetujuan" }

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
        { label: "Tambah Alur Persetujuan" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Alur Persetujuan</h1>
      </div>

      <WorkflowForm roles={roles} />
    </div>
  )
}
