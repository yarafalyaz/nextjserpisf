export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { JournalTable } from "./_components/journal-table"
import { FilterDrawer } from "@/components/ui/filter-drawer"

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  await requirePermission("view_journals")

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { journalNumber: { contains: params.search } },
        { description: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
  }

  const journals = await prisma.journal.findMany({
    where,
    include: {
      _count: { select: { entries: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const data = JSON.parse(JSON.stringify(journals))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Journals</h1>
<Link href="/keuangan/jurnal/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-journal-btn">
          + Buat Journal
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. journal atau deskripsi..." action="/keuangan/jurnal" />
          <FilterDrawer>
            <div className="flex flex-col gap-2">
              <Link href="/keuangan/jurnal" className={`filter-chip ${!params.status ? "active" : ""}`}>Semua</Link>
              <Link href="/keuangan/jurnal?status=DRAFT" className={`filter-chip ${params.status === "DRAFT" ? "active" : ""}`}>Draft</Link>
              <Link href="/keuangan/jurnal?status=POSTED" className={`filter-chip ${params.status === "POSTED" ? "active" : ""}`}>Posted</Link>
            </div>
          </FilterDrawer>
          <div className="flex gap-1.5 flex-wrap hidden lg:flex">
            <Link href="/keuangan/jurnal" className={`filter-chip ${!params.status ? "active" : ""}`}>Semua</Link>
            <Link href="/keuangan/jurnal?status=DRAFT" className={`filter-chip ${params.status === "DRAFT" ? "active" : ""}`}>Draft</Link>
            <Link href="/keuangan/jurnal?status=POSTED" className={`filter-chip ${params.status === "POSTED" ? "active" : ""}`}>Posted</Link>
          </div>
        </div>

        <JournalTable data={data} />
      </div>
    </div>
  )
}
