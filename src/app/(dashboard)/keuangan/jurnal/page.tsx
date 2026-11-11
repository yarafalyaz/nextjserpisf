import { Plus } from "lucide-react";
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

  const [journals, total] = await Promise.all([
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
  ])

  const data = toPlain(journals)

  const statusChips = (() => {
    const statuses = ["", ...JOURNAL_VALID_DB_STATUSES]
    return (
      <>
        {statuses.map((dbStatusKey) => {
          const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] : ""
          const targetPath = urlStatus ? `/keuangan/jurnal/status/${urlStatus}` : "/keuangan/jurnal"
          const isActive = activeUrlStatus === urlStatus

          return (
            <Link
              key={dbStatusKey || "all"}
              href={withListParams(targetPath, params, {
                halaman: undefined,
              })}
              className={`filter-chip ${isActive ? "active" : ""}`}
            >
              {dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}
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
      <div className="flex flex-wrap items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Jurnal</h1>
        <CanCreate permission="create_journals">
          <Link
            href="/keuangan/jurnal/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-md transition-all"
            id="create-journal-btn"
          >
            <Plus className="size-3.5" />
            <span>Buat Jurnal</span>
          </Link>
        </CanCreate>
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
