export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { WorkflowTable } from "./_components/workflow-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Workflow" }

export default async function WorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("manage_settings")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)
  const cari = params.cari?.trim()

  const where = {
    deletedAt: null,
    // Kotak cari DataTable menulis ?cari= (mode server) — terjemahkan ke query.
    ...(cari && {
      OR: [
        { name: { contains: cari } },
        { code: { contains: cari } },
        { modelType: { contains: cari } },
      ],
    }),
  }

  const workflows = await prisma.approvalWorkflow.findMany({
    where,
    orderBy: { name: "asc" },
    take,
    skip: (page - 1) * pageSize,
    select: {
      id: true,
      slug: true,
      name: true,
      modelType: true,
      isActive: true,
      _count: { select: { steps: true } },
    },
  })

  const total = await prisma.approvalWorkflow.count({ where })

  const data = workflows.map((wf) => ({
    id: wf.id,
    slug: wf.slug,
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
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
        >
          + Tambah Workflow
        </Link>
      </div>

      <WorkflowTable data={data} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
