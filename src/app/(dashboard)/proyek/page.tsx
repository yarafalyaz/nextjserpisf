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
import { ProjectStageQueueSection } from "./_components/project-stage-queue"
import { getProjectStageQueue } from "@/lib/reports/project-stage-queue-data"
import {
  PROJECT_STAGE_QUEUE_TITLE,
  type ProjectStageQueue,
} from "@/lib/reports/project-stage-queue"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Proyek" }

/** Redirect Next.js (termasuk gerbang izin fail-closed) bukan error muat. */
function isNextRedirect(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  )
}

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

  // Seksi turunan baca-saja (F-2026-10-27-092-S, Q-PSQ-3) dimuat
  // paralel dengan daftar utama. Gerbang view_projects ditegakkan
  // ulang fail-closed di loader sebelum query: redirect izin tetap
  // diteruskan, sedangkan kegagalan muat lain hanya mengosongkan
  // seksi turunan — daftar proyek existing tetap tampil.
  const stageQueuePromise: Promise<{
    queue: ProjectStageQueue | null
    redirectError?: unknown
  }> = getProjectStageQueue()
    .then((queue) => ({ queue }))
    .catch((error: unknown) => {
      if (isNextRedirect(error)) return { queue: null, redirectError: error }
      console.error("[proyek] antrean tahap proyek gagal dimuat:", error)
      return { queue: null }
    })

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        customer: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip: (page - 1) * pageSize,
    }),
    prisma.project.count({ where }),
  ])

  const stageResult = await stageQueuePromise
  if (stageResult.redirectError !== undefined) throw stageResult.redirectError
  const projectStageQueue = stageResult.queue

  const tableData = toPlain(projects)

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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Proyek</h1>
        <CanCreate permission="create_projects">
          <Link href="/proyek/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-project-btn">
            <FolderKanban size={16} /> Tambah Proyek
          </Link>
        </CanCreate>
      </div>

      {projectStageQueue ? (
        <ProjectStageQueueSection queue={projectStageQueue} />
      ) : (
        <section
          aria-label={PROJECT_STAGE_QUEUE_TITLE}
          className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
        >
          <div className="flex flex-col gap-1 p-4 px-5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">
              {PROJECT_STAGE_QUEUE_TITLE}
            </h2>
            <p className="text-xs text-muted-foreground">
              Antrean tahap proyek berjalan tidak dapat dimuat saat ini.
            </p>
          </div>
        </section>
      )}

      <ProjectTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={<AppSearchField placeholder="Cari proyek..." action="/proyek" />}
        filters={statusChips}
      />
    </div>
  )
}
