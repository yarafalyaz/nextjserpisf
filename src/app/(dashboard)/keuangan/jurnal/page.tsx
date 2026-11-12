import { Plus, BookOpen, Clock, CheckCircle2, RotateCcw } from "@/components/ui/fontawesome-icons"
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { indoToStatus, statusToIndo, statusLabel } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { JournalTable } from "./_components/journal-table"
import { FilterDrawer } from "@/components/ui/filter-drawer"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Jurnal" }

export const JOURNAL_VALID_DB_STATUSES = [
  "draft",
  "posted",
  "reversed",
] as const

export interface JournalsPageProps {
  statusParam?: string
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string; pageSize?: string }>
}

export async function renderJournalsPage({
  statusParam,
  searchParams,
}: JournalsPageProps) {
  await requirePermission("view_journals")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/keuangan/jurnal/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = JOURNAL_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { journalNumber: { contains: params.cari } },
        { description: { contains: params.cari } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  const [journals, total, statusGroups] = await Promise.all([
    prisma.journal.findMany({
      where,
      include: {
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take,
    }),
    prisma.journal.count({ where }),
    prisma.journal.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { id: true },
    }),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    draft: 0,
    posted: 0,
    reversed: 0,
  }
  for (const group of statusGroups) {
    const key = group.status.toLowerCase()
    if (key in counts) {
      counts[key] = (counts[key] ?? 0) + (group._count?.id ?? 0)
    }
  }

  const data = toPlain(journals)

  const statusChips = (() => {
    const statuses = ["", ...JOURNAL_VALID_DB_STATUSES]
    return (
      <>
        {statuses.map((dbStatusKey) => {
          const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] : ""
          const targetPath = urlStatus ? `/keuangan/jurnal/status/${urlStatus}` : "/keuangan/jurnal"
          const isActive = activeUrlStatus === urlStatus
          const count = dbStatusKey ? (counts[dbStatusKey.toLowerCase()] ?? 0) : counts.all

          return (
            <Link
              key={dbStatusKey || "all"}
              href={withListParams(targetPath, params, {
                halaman: undefined,
              })}
              className={`filter-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                isActive
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span>{dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}</span>
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
        })}
      </>
    )
  })()

  const currentActionPath = activeUrlStatus
    ? `/keuangan/jurnal/status/${activeUrlStatus}`
    : "/keuangan/jurnal"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Jurnal Umum & Penyesuaian</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Buku catatan transaksi double-entry, jurnal manual, dan penyesuaian akhir periode.
          </p>
        </div>
        <CanCreate permission="create_journals">
          <Link
            href="/keuangan/jurnal/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-journal-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Jurnal</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Jurnal
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <BookOpen className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh entri pembukuan</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Konsep (Draft)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.draft}
            </span>
            <Clock className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Belum diposting ke buku besar</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Terbit (Posted)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.posted}
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Sah mempengaruhi neraca saldo</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Dibalikkan (Reversed)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-muted-foreground font-mono tabular-nums">
              {counts.reversed}
            </span>
            <RotateCcw className="size-4 text-muted-foreground/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Jurnal balik koreksi</span>
        </div>
      </div>

      <JournalTable
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={<AppSearchField placeholder="Cari no. jurnal atau deskripsi..." action={currentActionPath} />}
        filters={
          <>
            <FilterDrawer>
              <div className="flex flex-col gap-2">{statusChips}</div>
            </FilterDrawer>
            <div className="hidden flex-wrap gap-1.5 lg:flex">{statusChips}</div>
          </>
        }
      />
    </div>
  )
}

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string; pageSize?: string }>
}) {
  return renderJournalsPage({ searchParams })
}
