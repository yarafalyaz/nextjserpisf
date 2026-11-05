export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import Link from "next/link"
import { indoToStatus, statusToIndo, statusLabel } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { JournalTable } from "./_components/journal-table"
import { FilterDrawer } from "@/components/ui/filter-drawer"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Jurnal" }

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_journals")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined
  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { journalNumber: { contains: params.cari } },
        { description: { contains: params.cari } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
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
    const statuses = ["", "draft", "posted", "reversed"]
    return (
      <>
        {statuses.map((dbStatus) => {
          const urlStatus = dbStatus ? statusToIndo[dbStatus] : ""
          return (
            <Link
              key={dbStatus || "all"}
              href={withListParams("/keuangan/jurnal", params, {
                status: urlStatus || undefined,
                halaman: undefined,
              })}
              className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
            >
              {dbStatus ? statusLabel(dbStatus) : "Semua"}
            </Link>
          )
        })}
      </>
    )
  })()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Jurnal</h1>
        <CanCreate permission="create_journals">
          <Link href="/keuangan/jurnal/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-journal-btn">
            + Buat Jurnal
          </Link>
        </CanCreate>
      </div>

      <JournalTable
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={<AppSearchField placeholder="Cari no. jurnal atau deskripsi..." action="/keuangan/jurnal" />}
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
