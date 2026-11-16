"use client"

import {
  OVERTIME_RECAP_NO_DEPARTMENT_LABEL,
  OVERTIME_RECAP_VALUE_NOT_CALCULATED_LABEL,
  type OvertimeRecap,
} from "@/lib/reports/overtime-recap"
import { EmptyState } from "@/components/ui/empty-state"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"

/** Nilai jam verbatim payload server — hanya diberi format tampil, tidak dihitung ulang. */
function hours(value: number): string {
  return formatNumber(value, 2)
}

function nameOrId(employeeId: number, name: string | null): string {
  return name ?? `Karyawan #${employeeId}`
}

type OvertimeEmployeeTableRow = OvertimeRecap["employees"][number] & { id: number }
type OvertimeProjectTableRow = OvertimeRecap["projects"][number] & { id: string }

const empColumnHelper = createColumnHelper<OvertimeEmployeeTableRow>()
const projColumnHelper = createColumnHelper<OvertimeProjectTableRow>()

const employeeColumns = [
  empColumnHelper.accessor("employeeName", {
    header: "Karyawan",
    meta: { mobilePrimary: true },
    cell: (info) => nameOrId(info.row.original.employeeId, info.getValue()),
  }),
  empColumnHelper.accessor("departmentName", {
    header: "Departemen",
    cell: (info) => info.getValue() ?? OVERTIME_RECAP_NO_DEPARTMENT_LABEL,
  }),
  empColumnHelper.accessor("requestCount", {
    header: "Pengajuan",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  empColumnHelper.accessor("submittedHours", {
    header: "Jam diajukan",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
  empColumnHelper.accessor("approvedHours", {
    header: "Jam disetujui",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
  empColumnHelper.accessor("pendingHours", {
    header: "Jam pending",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
  empColumnHelper.accessor("rejectedHours", {
    header: "Jam ditolak",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
  empColumnHelper.accessor("billableHours", {
    header: "Jam billable",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
  empColumnHelper.accessor("totalHours", {
    header: "Total jam tercatat",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
  empColumnHelper.accessor("mealHours", {
    header: "Jam makan",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
  empColumnHelper.accessor("oldestPendingDate", {
    header: "Menunggu tertua",
    cell: (info) => {
      const val = info.getValue()
      return (
        <span className="font-mono tabular-nums">
          {val ? formatDate(val, { format: "short" }) : "-"}
        </span>
      )
    },
  }),
  empColumnHelper.accessor("approvedValueMissingCount", {
    header: "Nilai disetujui",
    cell: (info) => {
      const count = info.getValue()
      return count > 0
        ? `${OVERTIME_RECAP_VALUE_NOT_CALCULATED_LABEL} (${count} pengajuan)`
        : "-"
    },
  }),
]

const projectColumns = [
  projColumnHelper.accessor("label", {
    header: "Proyek",
    meta: { mobilePrimary: true },
    cell: (info) => info.getValue(),
  }),
  projColumnHelper.accessor("requestCount", {
    header: "Pengajuan",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  projColumnHelper.accessor("submittedHours", {
    header: "Jam diajukan",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
  projColumnHelper.accessor("approvedHours", {
    header: "Jam disetujui",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
  projColumnHelper.accessor("pendingHours", {
    header: "Jam pending",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
  projColumnHelper.accessor("rejectedHours", {
    header: "Jam ditolak",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
  projColumnHelper.accessor("billableHours", {
    header: "Jam billable",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{hours(info.getValue())}</span>,
  }),
]

/**
 * Rekap lembur per karyawan per periode (F-2026-10-25-016-S, AC-OVR-F1/F3).
 *
 * Murni presentasi payload `loadOvertimeRecap` server: notice, baris
 * karyawan, ember proyek, dan total ditempel apa adanya — UI tidak
 * menjumlah, tidak menilai umur pending, dan tidak menampilkan nilai uang.
 * Kolom jam = definisi BR-OVR-03 server (diajukan/disetujui/pending/ditolak
 * dari `hours`; billable hanya approved). `approvedValueMissingCount > 0`
 * tampil sebagai label server, bukan angka nilai pengganti.
 */
export function OvertimeRecapTable({ recap }: Readonly<{ recap: OvertimeRecap }>) {
  const { totals } = recap
  const isEmpty = recap.employees.length === 0

  return (
    <section aria-label="Rekap lembur per karyawan" className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{recap.notice}</p>

      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-label="Ringkasan rekap lembur"
      >
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Karyawan</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.employeeCount}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pengajuan</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.requestCount}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Jam disetujui</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{hours(totals.approvedHours)}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Jam billable</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{hours(totals.billableHours)}</p>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState title="Tidak ada pengajuan lembur pada periode dan filter ini." className="py-10" />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">Per karyawan</h2>
            <DataTable
              data={recap.employees.map((employee) => ({
                ...employee,
                id: employee.employeeId,
              }))}
              columns={employeeColumns}
              ariaLabel="Rekap lembur per karyawan"
              selectable={false}
              enableColumnToggle={false}
              enableExport={false}
              pageSize={50}
            />
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-default bg-muted/30 px-4 py-3 text-xs">
              <span className="font-bold text-foreground uppercase tracking-wider">Total</span>
              <div className="flex flex-wrap items-center gap-4">
                <span>Pengajuan: <strong className="font-mono tabular-nums">{totals.requestCount}</strong></span>
                <span>Diajukan: <strong className="font-mono tabular-nums">{hours(totals.submittedHours)}</strong></span>
                <span>Disetujui: <strong className="font-mono tabular-nums">{hours(totals.approvedHours)}</strong></span>
                <span>Menunggu: <strong className="font-mono tabular-nums">{hours(totals.pendingHours)}</strong></span>
                <span>Ditolak: <strong className="font-mono tabular-nums">{hours(totals.rejectedHours)}</strong></span>
                <span>Billable: <strong className="font-mono tabular-nums">{hours(totals.billableHours)}</strong></span>
                <span>Total: <strong className="font-mono tabular-nums">{hours(totals.totalHours)}</strong></span>
                <span>Makan: <strong className="font-mono tabular-nums">{hours(totals.mealHours)}</strong></span>
                {totals.approvedValueMissingCount > 0 ? (
                  <span className="text-muted-foreground">
                    {`${OVERTIME_RECAP_VALUE_NOT_CALCULATED_LABEL} (${totals.approvedValueMissingCount} pengajuan)`}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold text-foreground">Per proyek</h2>
            <DataTable
              data={recap.projects.map((project) => ({
                ...project,
                id: String(project.projectId ?? "tanpa-proyek"),
              }))}
              columns={projectColumns}
              ariaLabel="Rekap lembur per proyek"
              selectable={false}
              enableColumnToggle={false}
              enableExport={false}
              pageSize={50}
            />
          </div>
        </>
      )}
    </section>
  )
}
