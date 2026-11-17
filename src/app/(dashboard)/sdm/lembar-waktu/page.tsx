import { Plus } from "@/components/ui/fontawesome-icons";
import { parsePagination } from "@/lib/utils/pagination"
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { canSearchAcrossEmployees, getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope"
import Link from "next/link"
import { PageHeader } from "@/components/ui/page-header"
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
  const userPerms: string[] = user.permissions ?? [];
  const showActions =
    userRoles.includes("super_admin") ||
    userPerms.includes("create_timesheets") ||
    userPerms.includes("delete_timesheets");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lembar Waktu (Timesheet)"
        subtitle="Pencatatan jam kerja harian, alokasi aktivitas proyek, dan verifikasi kehadiran tim."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Lembar Waktu" },
        ]}
        actions={
          <CanCreate permission="create_timesheets">
            <Link
              href="/sdm/lembar-waktu/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2"
              id="create-timesheet-btn"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Tambah Timesheet</span>
            </Link>
          </CanCreate>
        }
      />

      <TimesheetTable data={data} total={total} page={page} pageSize={pageSize} showActions={showActions} canSearch={canSearchAcrossEmployees(scope)} />
    </div>
  )
}
