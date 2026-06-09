export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { TimesheetTable } from "./_components/timesheet-table"

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_timesheets")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { employee: { name: { contains: params.cari } } },
      ],
    }),
  }

  const timesheets = await prisma.timesheet.findMany({
    where,
    include: { employee: { select: { name: true } } },
    take: 1000,
    orderBy: { date: "desc" },
  })

  const data = JSON.parse(JSON.stringify(timesheets))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Lembar Waktu</h1>
        <Link href="/sdm/lembar-waktu/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-timesheet-btn">
          + Tambah Timesheet
        </Link>
      </div>

      <TimesheetTable data={data} />
    </div>
  )
}
