export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { prisma } from "@/lib/db/prisma"
import { loadOvertimeRecap } from "@/lib/reports/overtime-recap-data"
import { OVERTIME_RECAP_STATUSES, type OvertimeRecapStatus } from "@/lib/reports/overtime-recap"
import {
  formatPeriodLabel,
  reportPeriodFromRoute,
  splitReportSegments,
} from "@/lib/reports/report-period"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ReportPeriodFilter, type ReportSelectFilter } from "@/components/reports/report-period-filter"
import { OvertimeRecapTable } from "../../_components/overtime-recap-table"

export const metadata: Metadata = { title: "Rekap Lembur" }

function parsePositiveId(raw: string | undefined): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function parseStatus(raw: string | undefined): OvertimeRecapStatus | null {
  return OVERTIME_RECAP_STATUSES.includes(raw as OvertimeRecapStatus)
    ? (raw as OvertimeRecapStatus)
    : null
}

/**
 * Rekap lembur per karyawan per periode (F-2026-10-25-016-S).
 *
 * Halaman baca-saja di area SDM: izin reuse `view_overtime` (Q-OVR-3) +
 * `getHrScope` fail-closed ditegakkan pemanggil; loader
 * `loadOvertimeRecap` menerima scope apa adanya dan builder server
 * mengelompokkan per karyawan/proyek. Semua angka, notice, dan total
 * ditempel verbatim payload (AC-OVR-F1) — halaman ini tidak menjumlah.
 *
 * Periode + filter hidup di path (pola laporan existing):
 *   /sdm/lembur/rekap/2026-10
 *   /sdm/lembur/rekap/2026-10-01_2026-10-31/departemen/2/status/approved/proyek/5
 * Pemilih departemen hanya ditawarkan scope `all` (AC-OVR-F2); untuk
 * scope lain nilai departemen dari URL tidak diteruskan ke loader
 * (loader sendiri mengiris ke scope, tetapi UI tidak menawarkannya).
 * Daftar transaksional `/sdm/lembur` tidak diubah (AC-OVR-F3).
 */
export default async function OvertimeRecapPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_overtime")
  const scope = await getHrScope(user)

  const { segments = [] } = await routeParams
  const { filters } = splitReportSegments(segments)

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))

  const showDepartmentFilter = scope.kind === "all"
  const departmentId = showDepartmentFilter ? parsePositiveId(filters.departemen) : null
  const projectId = parsePositiveId(filters.proyek)
  const status = parseStatus(filters.status)

  const [departments, projects] = await Promise.all([
    showDepartmentFilter
      ? prisma.department.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: number; name: string }[]),
    prisma.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const recap = await loadOvertimeRecap(scope, {
    periodStart: period.start,
    periodEnd: period.end,
    departmentId,
    projectId,
    status,
  })

  const selects: ReportSelectFilter[] = [
    ...(showDepartmentFilter
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
          } satisfies ReportSelectFilter,
        ]
      : []),
    {
      param: "status",
      label: "Status",
      placeholder: "Semua status",
      value: status ?? "",
      options: [
        { value: "pending", label: "Menunggu" },
        { value: "approved", label: "Disetujui" },
        { value: "rejected", label: "Ditolak" },
      ],
    },
    {
      param: "proyek",
      label: "Proyek",
      placeholder: "Semua proyek",
      value: projectId ? String(projectId) : "",
      options: projects.map((project) => ({
        value: String(project.id),
        label: project.name,
      })),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Lembur", href: "/sdm/lembur" },
          { label: "Rekap Lembur" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Rekap Lembur per Karyawan</h1>
        <p className="text-sm text-muted-foreground">{formatPeriodLabel(period)}</p>
      </div>

      <ReportPeriodFilter
        basePath="/sdm/lembur/rekap"
        mode="range"
        defaultStartDate={toLocalDateOnly(period.start)}
        defaultEndDate={toLocalDateOnly(period.end)}
        selects={selects}
      />

      <OvertimeRecapTable recap={recap} />
    </div>
  )
}
