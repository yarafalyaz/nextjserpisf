export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { FolderKanban } from "lucide-react"
import { AppSearchField } from "@/components/ui/search-field"
import { ProjectTable } from "./_components/project-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Proyek" }

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_projects")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      customer: true,
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const tableData = toPlain(projects) as any

  const statusChips = ["", "active", "completed", "cancelled"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/proyek${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Proyek"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Proyek</h1>
        <Link href="/proyek/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-project-btn">
          <FolderKanban size={16} /> Tambah Proyek
        </Link>
      </div>

      <ProjectTable
        data={tableData}
        toolbar={<AppSearchField placeholder="Cari proyek..." action="/proyek" />}
        filters={statusChips}
      />
    </div>
  )
}
