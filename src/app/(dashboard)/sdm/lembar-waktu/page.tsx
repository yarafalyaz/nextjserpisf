export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { TimesheetTable } from "./_components/timesheet-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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
    orderBy: { date: "desc" },
  })

  const data = JSON.parse(JSON.stringify(timesheets))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Timesheets</h1>
        <Link href="/sdm/lembar-waktu/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-timesheet-btn">
          + Tambah Timesheet
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama karyawan..." action="/sdm/lembar-waktu" />
        </div>

        <TimesheetTable data={data} />
      </div>
    </div>
  )
}
