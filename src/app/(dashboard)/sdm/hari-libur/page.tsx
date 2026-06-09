export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { HolidayTable } from "./_components/holiday-table"
import { SyncHolidaysButton } from "./_components/sync-holidays-button"

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
    take: 1000,
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
        <div className="flex items-center gap-2 flex-wrap">
          <SyncHolidaysButton />
          <Link href="/sdm/hari-libur/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-holiday-btn">
            + Tambah Hari Libur
          </Link>
        </div>
      </div>

      <HolidayTable data={data} />
    </div>
  )
}
