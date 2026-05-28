export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { FolderKanban } from "lucide-react"
import { AppSearchField } from "@/components/ui/search-field"
import { ProjectTable } from "./_components/project-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  await requirePermission("view_projects")

  const params = await searchParams

  const where = {
    ...(params.status && { status: params.status }),
    ...(params.search && {
      name: { contains: params.search },
    }),
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      customer: true,
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(projects))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Proyek"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Proyek</h1>
        <Link href="/proyek/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-project-btn">
          <FolderKanban size={16} /> Tambah Proyek
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {["", "active", "completed", "cancelled"].map((s) => (
              <Link key={s} href={`/projects?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s === "active" ? "Aktif" : s === "completed" ? "Selesai" : s === "cancelled" ? "Dibatalkan" : "Semua"}
              </Link>
            ))}
          </div>
          <AppSearchField placeholder="Cari proyek..." action="/proyek" />
        </div>

        <ProjectTable data={tableData} />
      </div>
    </div>
  )
}
