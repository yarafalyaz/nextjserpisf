import {
  OVERTIME_RECAP_NO_DEPARTMENT_LABEL,
  OVERTIME_RECAP_VALUE_NOT_CALCULATED_LABEL,
  type OvertimeRecap,
} from "@/lib/reports/overtime-recap"
import { formatDate, formatNumber } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableBody,
  DetailTableFoot,
  DetailTableFootRow,
  DetailTableHead,
  DetailTableRow,
  DetailTableTd,
  DetailTableTh,
} from "@/components/ui/detail-table"

/** Nilai jam verbatim payload server — hanya diberi format tampil, tidak dihitung ulang. */
function hours(value: number): string {
  return formatNumber(value, 2)
}

function nameOrId(employeeId: number, name: string | null): string {
  return name ?? `Karyawan #${employeeId}`
}

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
        <p className="rounded-xl border border-default bg-surface px-4 py-10 text-center text-sm text-muted-foreground">
          Tidak ada pengajuan lembur pada periode dan filter ini.
        </p>
      ) : (
        <>
          <div>
            <h2 className="mb-2 text-base font-semibold text-foreground">Per karyawan</h2>
            <DetailTable data-report-table="Rekap lembur per karyawan">
              <DetailTableHead>
                <DetailTableTh>Karyawan</DetailTableTh>
                <DetailTableTh>Departemen</DetailTableTh>
                <DetailTableTh align="right">Pengajuan</DetailTableTh>
                <DetailTableTh align="right">Jam diajukan</DetailTableTh>
                <DetailTableTh align="right">Jam disetujui</DetailTableTh>
                <DetailTableTh align="right">Jam pending</DetailTableTh>
                <DetailTableTh align="right">Jam ditolak</DetailTableTh>
                <DetailTableTh align="right">Jam billable</DetailTableTh>
                <DetailTableTh align="right">Total jam tercatat</DetailTableTh>
                <DetailTableTh align="right">Jam makan</DetailTableTh>
                <DetailTableTh>Pending tertua</DetailTableTh>
                <DetailTableTh>Nilai disetujui</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {recap.employees.map((employee) => (
                  <DetailTableRow key={employee.employeeId}>
                    <DetailTableTd>{nameOrId(employee.employeeId, employee.employeeName)}</DetailTableTd>
                    <DetailTableTd>
                      {employee.departmentName ?? OVERTIME_RECAP_NO_DEPARTMENT_LABEL}
                    </DetailTableTd>
                    <DetailTableTd align="right">{employee.requestCount}</DetailTableTd>
                    <DetailTableTd align="right">{hours(employee.submittedHours)}</DetailTableTd>
                    <DetailTableTd align="right">{hours(employee.approvedHours)}</DetailTableTd>
                    <DetailTableTd align="right">{hours(employee.pendingHours)}</DetailTableTd>
                    <DetailTableTd align="right">{hours(employee.rejectedHours)}</DetailTableTd>
                    <DetailTableTd align="right">{hours(employee.billableHours)}</DetailTableTd>
                    <DetailTableTd align="right">{hours(employee.totalHours)}</DetailTableTd>
                    <DetailTableTd align="right">{hours(employee.mealHours)}</DetailTableTd>
                    <DetailTableTd>
                      {employee.oldestPendingDate
                        ? formatDate(employee.oldestPendingDate, { format: "short" })
                        : "—"}
                    </DetailTableTd>
                    <DetailTableTd>
                      {employee.approvedValueMissingCount > 0
                        ? `${OVERTIME_RECAP_VALUE_NOT_CALCULATED_LABEL} (${employee.approvedValueMissingCount} pengajuan)`
                        : "—"}
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
              <DetailTableFoot>
                <DetailTableFootRow>
                  <DetailTableTd colSpan={2} className="font-bold">
                    Total
                  </DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">
                    {totals.requestCount}
                  </DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">
                    {hours(totals.submittedHours)}
                  </DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">
                    {hours(totals.approvedHours)}
                  </DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">
                    {hours(totals.pendingHours)}
                  </DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">
                    {hours(totals.rejectedHours)}
                  </DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">
                    {hours(totals.billableHours)}
                  </DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">
                    {hours(totals.totalHours)}
                  </DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">
                    {hours(totals.mealHours)}
                  </DetailTableTd>
                  <DetailTableTd className="font-bold">—</DetailTableTd>
                  <DetailTableTd className="font-bold">
                    {totals.approvedValueMissingCount > 0
                      ? `${OVERTIME_RECAP_VALUE_NOT_CALCULATED_LABEL} (${totals.approvedValueMissingCount} pengajuan)`
                      : "—"}
                  </DetailTableTd>
                </DetailTableFootRow>
              </DetailTableFoot>
            </DetailTable>
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold text-foreground">Per proyek</h2>
            <DetailTable data-report-table="Rekap lembur per proyek">
              <DetailTableHead>
                <DetailTableTh>Proyek</DetailTableTh>
                <DetailTableTh align="right">Pengajuan</DetailTableTh>
                <DetailTableTh align="right">Jam diajukan</DetailTableTh>
                <DetailTableTh align="right">Jam disetujui</DetailTableTh>
                <DetailTableTh align="right">Jam pending</DetailTableTh>
                <DetailTableTh align="right">Jam ditolak</DetailTableTh>
                <DetailTableTh align="right">Jam billable</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {recap.projects.map((project) => (
                  <DetailTableRow key={project.projectId ?? "tanpa-proyek"}>
                    <DetailTableTd>{project.label}</DetailTableTd>
                    <DetailTableTd align="right">{project.requestCount}</DetailTableTd>
                    <DetailTableTd align="right">{hours(project.submittedHours)}</DetailTableTd>
                    <DetailTableTd align="right">{hours(project.approvedHours)}</DetailTableTd>
                    <DetailTableTd align="right">{hours(project.pendingHours)}</DetailTableTd>
                    <DetailTableTd align="right">{hours(project.rejectedHours)}</DetailTableTd>
                    <DetailTableTd align="right">{hours(project.billableHours)}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        </>
      )}
    </section>
  )
}
