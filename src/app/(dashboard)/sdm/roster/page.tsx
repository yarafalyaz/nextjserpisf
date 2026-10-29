export const dynamic = "force-dynamic"

import { requireAnyPermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { CanCreate } from "@/components/auth/can-create"
import { formatDate } from "@/lib/utils/format"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { DeleteButton } from "@/components/ui/delete-button"
import { getWibTodayUtcDate, wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { loadEmployeeRoster } from "@/lib/reports/employee-roster-data"
import { getAttendanceEmployeeOptions } from "../absensi/_components/attendance-data"
import { deleteEmployeeRoster } from "@/actions/hrm.actions"
import { RosterForm, RosterDecisionButtons, ROSTER_TYPE_LABELS } from "./_components/roster-forms"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Roster Karyawan" }

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Disetujui",
  rejected: "Ditolak",
}

function monthRange(bulan: string): { dateFrom: Date; dateTo: Date } {
  const [year, month] = bulan.split("-").map(Number)
  return {
    dateFrom: wibDateToUtcMidnight(`${bulan}-01`),
    // Akhir bulan inklusif untuk loader (lte): hari pertama bulan berikut - 1ms.
    dateTo: new Date(Date.UTC(year, month, 1) - 1),
  }
}

/**
 * Roster karyawan: jalur tulis pertama EmployeeRoster (create/approve/
 * reject/delete di hrm.actions, izin keluarga absensi existing).
 * Halaman operasional — filter bulan/status/karyawan query params.
 * Baca lewat loader existing `loadEmployeeRoster`, disaring scope HR.
 */
export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; status?: string; karyawan?: string }>
}) {
  const user = await requireAnyPermission([
    "view_attendance",
    "create_attendance",
    "edit_attendance",
    "manage_attendance",
  ])
  const scope = await getHrScope(user)
  const params = await searchParams

  const todayWib = getWibTodayUtcDate().toISOString().slice(0, 10)
  const bulan = /^\d{4}-\d{2}$/.test(params.bulan ?? "") ? params.bulan! : todayWib.slice(0, 7)
  const status = ["draft", "approved", "rejected"].includes(params.status ?? "")
    ? params.status!
    : null
  const karyawanId = Number(params.karyawan)
  const employeeFilter =
    Number.isSafeInteger(karyawanId) && karyawanId > 0 ? karyawanId : null

  const { dateFrom, dateTo } = monthRange(bulan)
  const [allRows, employees] = await Promise.all([
    loadEmployeeRoster({ dateFrom, dateTo, status }),
    getAttendanceEmployeeOptions(scope),
  ])
  // Loader tak kenal scope: saring ke karyawan dalam jangkauan pemanggil.
  const allowedIds = new Set(employees.map((e) => e.id))
  const rows = allRows.filter(
    (row) =>
      allowedIds.has(row.employeeId) &&
      (employeeFilter == null || row.employeeId === employeeFilter),
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Roster Karyawan"
        subtitle="Jadwal non-kerja per karyawan per tanggal: cuti, sakit, izin, tugas luar, libur ganti. Draft menunggu persetujuan."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Roster Karyawan" },
        ]}
      />

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Roster</h2>
            <p className="text-xs text-muted-foreground">
              Tambah roster berstatus draft; setujui atau tolak dari daftar.
            </p>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Bulan
              <input
                type="month"
                name="bulan"
                defaultValue={bulan}
                className="h-9 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                name="status"
                defaultValue={status ?? ""}
                className="h-9 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
              >
                <option value="">Semua status</option>
                <option value="draft">Draft</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Karyawan
              <select
                name="karyawan"
                defaultValue={employeeFilter ? String(employeeFilter) : ""}
                className="h-9 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
              >
                <option value="">Semua karyawan</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Filter
            </button>
          </form>
        </div>

        <CanCreate permission="create_attendance">
          <RosterForm employees={employees} />
        </CanCreate>

        <div className="p-4 px-5">
          {rows.length === 0 ? (
            <EmptyState title="Belum ada roster pada filter ini" className="py-10" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Karyawan</DetailTableTh>
                <DetailTableTh>Jenis</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh>Catatan</DetailTableTh>
                <DetailTableTh>Disetujui</DetailTableTh>
                <DetailTableTh align="right">Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {rows.map((row) => (
                  <DetailTableRow key={row.id}>
                    <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                    <DetailTableTd className="font-medium">{row.employeeName}</DetailTableTd>
                    <DetailTableTd>{ROSTER_TYPE_LABELS[row.type] ?? row.type}</DetailTableTd>
                    <DetailTableTd>
                      <span
                        className={`status-badge ${
                          row.status === "approved"
                            ? "status-active"
                            : row.status === "rejected"
                              ? "status-cancelled"
                              : "status-draft"
                        }`}
                      >
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </DetailTableTd>
                    <DetailTableTd>{row.notes ?? "-"}</DetailTableTd>
                    <DetailTableTd>
                      {row.approvedAt ? formatDate(row.approvedAt) : "-"}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      <div className="flex items-center justify-end gap-2">
                        {row.status === "draft" && (
                          <CanCreate permission="edit_attendance">
                            <RosterDecisionButtons id={row.id} />
                          </CanCreate>
                        )}
                        {row.status === "draft" && (
                          <CanCreate permission="manage_attendance">
                            <DeleteButton id={row.id} action={deleteEmployeeRoster} />
                          </CanCreate>
                        )}
                      </div>
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  )
}
