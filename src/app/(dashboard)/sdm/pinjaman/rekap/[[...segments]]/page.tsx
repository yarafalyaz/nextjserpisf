export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { loadEmployeeLoanRecap } from "@/lib/reports/employee-loan-recap-data"
import { splitReportSegments } from "@/lib/reports/report-period"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ReportPeriodFilter, type ReportSelectFilter } from "@/components/reports/report-period-filter"
import { EmployeeLoanRecapTable } from "../../_components/employee-loan-recap-table"

export const metadata: Metadata = { title: "Rekap Pinjaman" }

function parsePositiveId(raw: string | undefined): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * Rekap sisa pinjaman aktif per karyawan (F-2026-10-25-046-S).
 *
 * Halaman baca-saja di area SDM: izin reuse `view_employee_loans`
 * (Q-LR46-3) + `getHrScope` fail-closed ditegakkan loader
 * `loadEmployeeLoanRecap`; halaman hanya meneruskan departemen terpilih.
 * Semua angka, notice, dan total ditempel verbatim payload (AC-LR46-F1) —
 * halaman ini tidak menjumlah dan tidak memproyeksikan apa pun.
 *
 * Filter tanpa periode (EC-6 potret berjalan): kunci path hanya
 * `departemen/<id>`; kunci lain = URL salah (404). Pemilih departemen
 * hanya ditawarkan scope `all` (AC-LR46-F2); scope lain tidak meneruskan
 * nilai departemen dari URL. Daftar transaksional `/sdm/pinjaman`
 * tidak diubah (AC-LR46-F3).
 */
export default async function EmployeeLoanRecapPage({
  params: routeParams,
}: {
  params: Promise<{ segments?: string[] }>
}) {
  await requirePermission("view_employee_loans")

  const { segments = [] } = await routeParams
  if (segments.length % 2 !== 0) notFound()
  const { periodSlug, filters } = splitReportSegments(segments)
  if (periodSlug || Object.keys(filters).some((key) => key !== "departemen")) notFound()

  const departmentFilterId = parsePositiveId(filters.departemen)

  // Muat tanpa filter dulu: scope server menentukan apakah pemilih
  // departemen boleh ditawarkan (AC-LR46-F2) sebelum filter diterapkan.
  const unfiltered = await loadEmployeeLoanRecap()
  const showDepartmentFilter = unfiltered.scope.kind === "all"
  const departmentId = showDepartmentFilter ? departmentFilterId : null

  const departments = showDepartmentFilter
    ? await prisma.department.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : []

  const { recap } =
    departmentId === null ? unfiltered : await loadEmployeeLoanRecap({ departmentId })

  const selects: ReportSelectFilter[] = showDepartmentFilter
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

  return (
    <div className="flex flex-col gap-5">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pinjaman", href: "/sdm/pinjaman" },
          { label: "Rekap Pinjaman" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Rekap Pinjaman per Karyawan</h1>
        <p className="text-sm text-muted-foreground">Potret sisa pinjaman berjalan per karyawan</p>
      </div>

      {showDepartmentFilter ? (
        <ReportPeriodFilter
          basePath="/sdm/pinjaman/rekap"
          mode="none"
          defaultStartDate=""
          selects={selects}
        />
      ) : null}

      <EmployeeLoanRecapTable recap={recap} />
    </div>
  )
}
