export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { CanCreate } from "@/components/auth/can-create"
import { PageHeader } from "@/components/ui/page-header"
import { RecruitmentTable } from "./_components/recruitment-table"
import { toPlain } from "@/lib/utils/serialization"
import { formatNumber } from "@/lib/utils/format"
import { Briefcase, Plus, Users, CheckCircle2, Clock } from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Rekrutmen" }

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Terbuka",
  closed: "Ditutup",
}

export const RECRUITMENT_VALID_STATUSES = ["draft", "open", "closed"] as const

export interface RecruitmentsPageProps {
  statusParam?: string
  searchParams: Promise<{ status?: string }>
}

export async function renderRecruitmentsPage({
  statusParam,
  searchParams,
}: RecruitmentsPageProps) {
  await requirePermission("view_recruitments")
  const params = await searchParams

  if (!statusParam && params.status) {
    redirect(`/sdm/rekrutmen/status/${params.status}`)
  }

  if (statusParam && !RECRUITMENT_VALID_STATUSES.includes(statusParam as (typeof RECRUITMENT_VALID_STATUSES)[number])) {
    notFound()
  }

  const activeStatus = statusParam ?? ""

  const [vacancies, countsByStatus, totalApplicantsCount] = await Promise.all([
    prisma.jobVacancy.findMany({
      where: {
        deletedAt: null,
        ...(activeStatus ? { status: activeStatus } : {}),
      },
      include: {
        department: { select: { name: true } },
        position: { select: { name: true } },
        _count: { select: { applicants: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.jobVacancy.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.jobApplicant.count({
      where: { vacancy: { deletedAt: null } },
    }),
  ])

  const statusCountMap = countsByStatus.reduce<Record<string, number>>((acc, curr) => {
    acc[curr.status] = curr._count._all
    return acc
  }, {})
  const totalVacancies = countsByStatus.reduce((acc, curr) => acc + curr._count._all, 0)

  const chips = ["", "draft", "open", "closed"]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rekrutmen"
        subtitle="Manajemen lowongan pekerjaan, posisi terbuka, dan proses seleksi pelamar kerja"
        breadcrumbs={
          activeStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "SDM", href: "/sdm" },
                { label: "Rekrutmen", href: "/sdm/rekrutmen" },
                { label: STATUS_LABELS[activeStatus] ?? activeStatus },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "SDM", href: "/sdm" },
                { label: "Rekrutmen" },
              ]
        }
        actions={
          <CanCreate permission="create_recruitments">
            <Link
              href="/sdm/rekrutmen/tambah"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Tambah Lowongan</span>
            </Link>
          </CanCreate>
        }
      />

      {/* ERP Unified Metric Strip */}
      <div
        className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4"
        aria-label="Ringkasan status rekrutmen"
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Lowongan</span>
            <Briefcase className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalVacancies)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Seluruh posisi terdaftar</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Lowongan Terbuka</span>
            <CheckCircle2 className="size-4 text-emerald-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(statusCountMap["open"] ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Menerima lamaran aktif</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Draf / Menunggu</span>
            <Clock className="size-4 text-amber-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(statusCountMap["draft"] ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Belum dipublikasikan</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Pelamar</span>
            <Users className="size-4 text-blue-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalApplicantsCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Pelamar masuk terdaftar</p>
        </div>
      </div>

      <RecruitmentTable
        data={toPlain(vacancies)}
        filters={
          <div className="flex flex-wrap gap-1.5">
            {chips.map((s) => {
              const isActive = activeStatus === s
              const count = s ? (statusCountMap[s] ?? 0) : totalVacancies

              return (
                <Link
                  key={s || "all"}
                  href={s ? `/sdm/rekrutmen/status/${s}` : "/sdm/rekrutmen"}
                  className={`filter-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    isActive
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>{s ? STATUS_LABELS[s] : "Semua"}</span>
                  <span
                    className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
                      isActive
                        ? "bg-primary text-primary-foreground font-bold"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {formatNumber(count)}
                  </span>
                </Link>
              )
            })}
          </div>
        }
      />
    </div>
  )
}

export default async function RecruitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  return renderRecruitmentsPage({ searchParams })
}
