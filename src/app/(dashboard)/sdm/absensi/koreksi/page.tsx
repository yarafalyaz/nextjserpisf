export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"

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
import { statusToIndo, statusLabel, indoToStatus } from "@/lib/utils/status-labels"

export const metadata: Metadata = { title: ATTENDANCE_CORRECTION_TITLE }

export const ATTENDANCE_CORRECTION_VALID_DB_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const

export interface AttendanceCorrectionsPageProps {
  statusParam?: string
  searchParams: Promise<{ status?: string }>
}

export async function renderAttendanceCorrectionsPage({
  statusParam,
  searchParams,
}: AttendanceCorrectionsPageProps) {
  const user = await requirePermission("view_attendance_corrections")
  const scope = await getHrScope(user)
  const params = await searchParams

  if (!statusParam && params.status) {
    const urlStatus = statusToIndo[params.status] || params.status
    redirect(`/sdm/absensi/koreksi/status/${urlStatus}`)
  }

  const validUrlStatuses = ATTENDANCE_CORRECTION_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { rows, totals } = await loadAttendanceCorrections(scope, { status: dbStatus })
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
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "SDM", href: "/sdm" },
                { label: "Absensi", href: "/sdm/absensi" },
                { label: ATTENDANCE_CORRECTION_TITLE, href: "/sdm/absensi/koreksi" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "SDM", href: "/sdm" },
                { label: "Absensi", href: "/sdm/absensi" },
                { label: ATTENDANCE_CORRECTION_TITLE },
              ]
        }
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
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {["", ...ATTENDANCE_CORRECTION_VALID_DB_STATUSES].map((dbStatusKey) => {
          const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
          const targetPath = urlStatus
            ? `/sdm/absensi/koreksi/status/${urlStatus}`
            : "/sdm/absensi/koreksi"
          const active = activeUrlStatus === urlStatus
          return (
            <Link
              key={dbStatusKey || "all"}
              href={targetPath}
              className={`filter-chip ${active ? "active" : ""}`}
            >
              {dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}
            </Link>
          )
        })}
      </div>

      <AttendanceCorrectionTable
        rows={rows}
        canApprove={canApprove}
        canCreate={canCreate}
        currentEmployeeId={me?.id ?? null}
      />
    </div>
  )
}

export default async function AttendanceCorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  return renderAttendanceCorrectionsPage({ searchParams })
}
