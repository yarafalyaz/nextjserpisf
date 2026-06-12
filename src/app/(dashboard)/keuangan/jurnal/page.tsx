export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { JournalTable } from "./_components/journal-table"
import { FilterDrawer } from "@/components/ui/filter-drawer"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Jurnal" }

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string }>
}) {
  await requirePermission("view_journals")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined
  const page = Number(params.halaman) || 1
  const perPage = 100

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
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.journal.count({ where }),
  ])

  const totalPages = Math.ceil(total / perPage)
  const data = toPlain(journals) as any

  const statusChips = (
    <>
      <Link href="/keuangan/jurnal" className={`filter-chip ${!params.status ? "active" : ""}`}>Semua</Link>
      <Link href="/keuangan/jurnal?status=DRAFT" className={`filter-chip ${params.status === "DRAFT" ? "active" : ""}`}>Konsep</Link>
      <Link href="/keuangan/jurnal?status=POSTED" className={`filter-chip ${params.status === "POSTED" ? "active" : ""}`}>Diposting</Link>
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Jurnal</h1>
<Link href="/keuangan/jurnal/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-journal-btn">
          + Buat Jurnal
        </Link>
      </div>

      <JournalTable
        data={data}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 px-5 border-t border-default">
          <span className="text-[0.8125rem] text-muted-foreground">Hal {page} dari {totalPages} ({total} data)</span>
          <div className="flex gap-1">
            {page > 1 && <Link href={`/keuangan/jurnal?halaman=${page - 1}`} className="button button--ghost button--sm">← Sebelumnya</Link>}
            {page < totalPages && <Link href={`/keuangan/jurnal?halaman=${page + 1}`} className="button button--ghost button--sm">Berikutnya →</Link>}
          </div>
        </div>
      )}
    </div>
  )
}
