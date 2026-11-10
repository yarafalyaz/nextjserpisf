export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
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

export const PROJECT_VALID_URL_STATUSES = ["aktif", "dalam-proses", "selesai"] as const
export type ProjectUrlStatus = (typeof PROJECT_VALID_URL_STATUSES)[number]

/** Redirect Next.js (termasuk gerbang izin fail-closed) bukan error muat. */
function isNextRedirect(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  )
}

export interface ProjectListPageProps {
  statusParam?: string
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderProjectsPage({
  statusParam,
  searchParams,
}: ProjectListPageProps) {
  await requirePermission("view_projects")

  const params = await searchParams

  // Jika URL query lama ?status=... dikunjungi di root /proyek, redirect ke /proyek/status/[status]
  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/proyek/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  // Jika diakses via /proyek/status/[status], validasi statusnya
  if (statusParam && !PROJECT_VALID_URL_STATUSES.includes(statusParam as ProjectUrlStatus)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(dbStatus && { status: dbStatus }),
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

  // Putaran 88: himpunan status proyek nyata (project-status.ts) — chip
  // "cancelled" selalu kosong (tak ada penulis) dan in_progress tak terpilih.
  const statusChips = ["", "active", "in_progress", "completed"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    const targetPath = urlStatus ? `/proyek/status/${urlStatus}` : "/proyek"
    const isActive = activeUrlStatus === urlStatus

    return (
      <Link
        key={dbStatus}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`filter-chip ${isActive ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  const currentActionPath = activeUrlStatus ? `/proyek/status/${activeUrlStatus}` : "/proyek"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Proyek", href: "/proyek" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Proyek" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Proyek</h1>
        <CanCreate permission="create_projects">
          <Link
            href="/proyek/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-project-btn"
          >
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
        toolbar={<AppSearchField placeholder="Cari proyek..." action={currentActionPath} />}
        filters={statusChips}
      />
    </div>
  )
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderProjectsPage({ searchParams })
}
