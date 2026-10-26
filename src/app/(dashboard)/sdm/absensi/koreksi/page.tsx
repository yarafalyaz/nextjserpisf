export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { loadAttendanceCorrections } from "@/lib/reports/attendance-correction-data"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ReportSummaryStrip } from "@/components/reports/report-card-shell"
import {
  AttendanceCorrectionTable,
  ATTENDANCE_CORRECTION_TITLE,
} from "../_components/attendance-correction-table"

export const metadata: Metadata = { title: ATTENDANCE_CORRECTION_TITLE }

const STATUS_FILTERS = [
  { value: "", label: "Semua" },
  { value: "pending", label: "Menunggu" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
  { value: "cancelled", label: "Dibatalkan" },
] as const

/**
 * F-2026-10-25-010-S (konsumen UI PR #954): pengajuan + antrean putusan
 * koreksi absensi. Scope HR fail-closed dari `getHrScope` diteruskan utuh
 * ke loader (karyawan hanya melihat pengajuannya sendiri). Total per status
 * tampil verbatim dari builder; putusan tetap lewat aksi server per baris.
 */
export default async function AttendanceCorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const user = await requirePermission("view_attendance_corrections")
  const scope = await getHrScope(user)
  const params = await searchParams
  const status = STATUS_FILTERS.some((f) => f.value === params.status && f.value)
    ? params.status
    : undefined

  const { rows, totals } = await loadAttendanceCorrections(scope, { status })
  const [canCreate, canApprove, me] = await Promise.all([
    hasPermission("create_attendance_corrections"),
    hasPermission("approve_attendance_corrections"),
    prisma.employee.findFirst({
      where: { userId: Number(user.id) },
      select: { id: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Absensi", href: "/sdm/absensi" },
          { label: ATTENDANCE_CORRECTION_TITLE },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {ATTENDANCE_CORRECTION_TITLE}
        </h1>
        {canCreate ? (
          <Link
            href="/sdm/absensi/koreksi/ajukan"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-hover"
          >
            Ajukan Koreksi
          </Link>
        ) : null}
      </div>

      <ReportSummaryStrip
        items={[
          ["Total", totals.total],
          ["Menunggu", totals.pending],
          ["Disetujui", totals.approved],
          ["Ditolak", totals.rejected],
          ["Dibatalkan", totals.cancelled],
          ["Menunggu Berkonflik", totals.conflictedPending],
        ]}
      />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter status pengajuan">
        {STATUS_FILTERS.map((f) => {
          const active = (status ?? "") === f.value
          return (
            <Link
              key={f.label}
              href={f.value ? `/sdm/absensi/koreksi?status=${f.value}` : "/sdm/absensi/koreksi"}
              aria-current={active ? "page" : undefined}
              className={`filter-chip ${active ? "active" : ""}`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      <AttendanceCorrectionTable
        rows={rows}
        currentEmployeeId={me?.id ?? null}
        canApprove={canApprove}
        canCreate={canCreate}
      />
    </div>
  )
}
