export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { HolidayTable } from "./_components/holiday-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  const params = await searchParams

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const holidays = await prisma.holiday.findMany({
    where,
    orderBy: { date: "desc" },
  })

  const data = holidays.map((h) => ({
    id: h.id,
    name: h.name,
    date: h.date.toISOString(),
    description: h.description,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Hari Libur</h1>
        <Link href="/sdm/hari-libur/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-holiday-btn">
          + Tambah Hari Libur
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama hari libur..." action="/sdm/hari-libur" />
        </div>

        <HolidayTable data={data} />
      </div>
    </div>
  )
}
