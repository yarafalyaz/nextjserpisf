import { parsePagination } from "@/lib/utils/pagination"
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { canSearchAcrossEmployees, getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope"
import Link from "next/link"
import { TimesheetTable } from "./_components/timesheet-table"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Lembar Waktu" }

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  const user = await requirePermission("view_timesheets")
  const scope = await getHrScope(user)

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...hrScopeWhere(scope),
    ...(params.cari && canSearchAcrossEmployees(scope) && {
      OR: [
        { employee: { name: { contains: params.cari } } },
      ],
    }),
  }

  const timesheets = await prisma.timesheet.findMany({
    where,
    include: { employee: { select: { name: true } } },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { date: "desc" },
  })

  const total = await prisma.timesheet.count({ where })

  const data = toPlain(timesheets)

  // Only show action column if user has permission to edit or delete timesheets
  const userRoles: string[] = user.roles ?? [];
  const userPerms: string[] = (user as any).permissions ?? [];
  const showActions =
    userRoles.includes("super_admin") ||
    userPerms.includes("create_timesheets") ||
    userPerms.includes("delete_timesheets");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Lembar Waktu</h1>
        <CanCreate permission="create_timesheets">
          <Link href="/sdm/lembar-waktu/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-timesheet-btn">
          + Tambah Timesheet
        </Link>
        </CanCreate>
      </div>

      <TimesheetTable data={data} total={total} page={page} pageSize={pageSize} showActions={showActions} />
    </div>
  )
}
