export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { FolderKanban, Plus, Clock, CheckCircle2 } from "@/components/ui/fontawesome-icons"
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

  const [projects, total, statusGroups] = await Promise.all([
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
    prisma.project.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    active: 0,
    in_progress: 0,
    completed: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count?.id ?? 0
    }
  }

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
    const count = dbStatus ? (counts[dbStatus] ?? 0) : counts.all

    return (
      <Link
        key={dbStatus}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          isActive
            ? "border-primary bg-primary/10 text-primary font-semibold"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <span>{dbStatus ? statusLabel(dbStatus) : "Semua"}</span>
        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
            isActive
              ? "bg-primary text-primary-foreground font-bold"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Manajemen Proyek (Project)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pelacakan progres pekerjaan proyek pelanggan, milestone tahapan, RAB anggaran, dan penjadwalan tim.
          </p>
        </div>
        <CanCreate permission="create_projects">
          <Link
            href="/proyek/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-project-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Proyek</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Proyek
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <FolderKanban className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh portofolio proyek</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Aktif / Perencanaan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.active}
            </span>
            <Clock className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Fase inisiasi dan desain</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Dalam Pengerjaan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-primary font-mono tabular-nums">
              {counts.in_progress}
            </span>
            <FolderKanban className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Sedang tahap eksekusi</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Selesai
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.completed}
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Serah terima dan closeout</span>
        </div>
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
