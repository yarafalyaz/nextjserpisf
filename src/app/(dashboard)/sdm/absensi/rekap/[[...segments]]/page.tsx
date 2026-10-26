export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { prisma } from "@/lib/db/prisma"
import { loadAttendanceRecap } from "@/lib/reports/attendance-recap-data"
import {
  formatPeriodLabel,
  reportPeriodFromRoute,
  splitReportSegments,
} from "@/lib/reports/report-period"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ReportPeriodFilter, type ReportSelectFilter } from "@/components/reports/report-period-filter"
import { AttendanceRecapTable } from "../../_components/attendance-recap-table"

export const metadata: Metadata = { title: "Rekap Kehadiran" }

/**
 * Rekap kehadiran per karyawan per periode (F-2026-10-25-044-S).
 *
 * Halaman baca-saja di area SDM: izin reuse `view_attendance` (Q-ATT-3) +
 * `getHrScope` fail-closed ditegakkan pemanggil; loader
 * `loadAttendanceRecap` menerima scope apa adanya dan builder server
 * mengklasifikasikan ember hari. Semua angka, notice, dan total ditempel
 * verbatim payload — halaman ini tidak mengklasifikasi dan tidak
 * menjumlah ulang.
 *
 * Periode + filter hidup di path (pola rekap SDM existing):
 *   /sdm/absensi/rekap/2026-10
 *   /sdm/absensi/rekap/2026-10-01_2026-10-31/departemen/2
 * Pemilih departemen hanya ditawarkan scope `all`; untuk scope lain
 * nilai departemen dari URL tidak diteruskan ke loader. Daftar
 * transaksional `/sdm/absensi` tidak diubah.
 */
export default async function AttendanceRecapPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_attendance")
  const scope = await getHrScope(user)

  const { segments = [] } = await routeParams
  const { filters } = splitReportSegments(segments)

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))

  // Pemilih departemen hanya untuk scope `all`; scope lain: nilai URL
  // tidak diteruskan ke loader (loader tetap mengiris ke scope server).
  const isAllScope = scope.kind === "all"
  let departmentId: number | null = null
  let departments: { id: number; name: string }[] = []
  if (isAllScope) {
    const parsed = Number(filters.departemen)
    departmentId = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
    departments = await prisma.department.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    })
  }

  const recap = await loadAttendanceRecap(scope, {
    periodStart: period.start,
    periodEnd: period.end,
    departmentId,
  })

  const selects: ReportSelectFilter[] = isAllScope
    ? [
        {
          param: "departemen",
          label: "Departemen",
          placeholder: "Semua departemen",
          value: departmentId ? String(departmentId) : "",
          options: departments.map((department) => ({
            value: String(department.id),
            label: department.name,
          })),
        },
      ]
    : []

  const periodLabel = formatPeriodLabel(period)

  return (
    <div className="flex flex-col gap-5">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Absensi", href: "/sdm/absensi" },
          { label: "Rekap Kehadiran" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Rekap Kehadiran per Karyawan</h1>
        <p className="text-sm text-muted-foreground">{periodLabel}</p>
      </div>

      <ReportPeriodFilter
        basePath="/sdm/absensi/rekap"
        mode="range"
        defaultStartDate={toLocalDateOnly(period.start)}
        defaultEndDate={toLocalDateOnly(period.end)}
        selects={selects}
      />

      <AttendanceRecapTable recap={recap} />
    </div>
  )
}
