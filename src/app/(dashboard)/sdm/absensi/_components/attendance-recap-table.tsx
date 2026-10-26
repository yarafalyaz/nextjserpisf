import {
  ATTENDANCE_RECAP_NO_DEPARTMENT_LABEL,
  ATTENDANCE_RECAP_NO_SCHEDULE_LABEL,
  type AttendanceRecap,
} from "@/lib/reports/attendance-recap"
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

/** Hari null dari payload = tidak diturunkan server (tanpa jadwal), bukan 0. */
function days(value: number | null): string {
  return value === null ? "—" : String(value)
}

/**
 * Rekap kehadiran per karyawan per periode (F-2026-10-25-044-S).
 *
 * Murni presentasi payload `loadAttendanceRecap` server: notice, ember
 * hari per karyawan, dan total ditempel verbatim — UI tidak
 * mengklasifikasi status, tidak menjumlah, dan tidak menampilkan
 * nominal uang apa pun (BR-ATT-05: rekap bukan dasar potongan).
 * Karyawan tanpa jadwal (`hasSchedule=false`) tampil berlabel server
 * "Tanpa jadwal" dengan hari terjadwal "—" (BR-ATT-04), bukan 0.
 */
export function AttendanceRecapTable({ recap }: Readonly<{ recap: AttendanceRecap }>) {
  const { totals } = recap
  const isEmpty = recap.employees.length === 0

  return (
    <section aria-label="Rekap kehadiran per karyawan" className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{recap.notice}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Ringkasan rekap kehadiran">
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Karyawan</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.employeeCount}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hari hadir</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.presentDays}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Alpa tercatat</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.absentDays}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tanpa rekod</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.noRecordDays}</p>
        </div>
      </div>

      {isEmpty ? (
        <p className="rounded-xl border border-default bg-surface px-4 py-10 text-center text-sm text-muted-foreground">
          Tidak ada karyawan dalam cakupan pada periode dan filter ini.
        </p>
      ) : (
        <div>
          <h2 className="mb-2 text-base font-semibold text-foreground">Per karyawan</h2>
          <DetailTable data-report-table="Rekap kehadiran per karyawan">
            <DetailTableHead>
              <DetailTableTh>Karyawan</DetailTableTh>
              <DetailTableTh>Departemen</DetailTableTh>
              <DetailTableTh align="right">Hari kerja terjadwal</DetailTableTh>
              <DetailTableTh align="right">Hari terevaluasi</DetailTableTh>
              <DetailTableTh align="right">Hadir</DetailTableTh>
              <DetailTableTh align="right">Sakit</DetailTableTh>
              <DetailTableTh align="right">Cuti/Izin</DetailTableTh>
              <DetailTableTh align="right">Alpa tercatat</DetailTableTh>
              <DetailTableTh align="right">Setengah hari</DetailTableTh>
              <DetailTableTh align="right">Status lain</DetailTableTh>
              <DetailTableTh align="right">Tanpa rekod</DetailTableTh>
              <DetailTableTh align="right">Kali telat</DetailTableTh>
              <DetailTableTh align="right">Menit telat</DetailTableTh>
              <DetailTableTh align="right">Menit lembur tercatat</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {recap.employees.map((employee) => (
                <DetailTableRow key={employee.employeeId}>
                  <DetailTableTd>
                    {employee.employeeName ?? `Karyawan #${employee.employeeId}`}
                    {employee.hasSchedule ? null : (
                      <span className="text-muted-foreground"> ({ATTENDANCE_RECAP_NO_SCHEDULE_LABEL})</span>
                    )}
                  </DetailTableTd>
                  <DetailTableTd>
                    {employee.departmentName ?? ATTENDANCE_RECAP_NO_DEPARTMENT_LABEL}
                  </DetailTableTd>
                  <DetailTableTd align="right">{days(employee.scheduledWorkDays)}</DetailTableTd>
                  <DetailTableTd align="right">{days(employee.scheduledEvaluatedDays)}</DetailTableTd>
                  <DetailTableTd align="right">{employee.presentDays}</DetailTableTd>
                  <DetailTableTd align="right">{employee.sickDays}</DetailTableTd>
                  <DetailTableTd align="right">{employee.leaveDays}</DetailTableTd>
                  <DetailTableTd align="right">{employee.absentDays}</DetailTableTd>
                  <DetailTableTd align="right">{employee.halfDayDays}</DetailTableTd>
                  <DetailTableTd align="right">{employee.otherStatusDays}</DetailTableTd>
                  <DetailTableTd align="right">{days(employee.noRecordDays)}</DetailTableTd>
                  <DetailTableTd align="right">{employee.lateEventCount}</DetailTableTd>
                  <DetailTableTd align="right">{employee.totalLateMinutes}</DetailTableTd>
                  <DetailTableTd align="right">{employee.totalOvertimeMinutes}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
            <DetailTableFoot>
              <DetailTableFootRow>
                <DetailTableTd colSpan={2} className="font-bold">
                  Total
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.scheduledWorkDays}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.scheduledEvaluatedDays}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.presentDays}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.sickDays}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.leaveDays}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.absentDays}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.halfDayDays}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.otherStatusDays}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.noRecordDays}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.lateEventCount}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.totalLateMinutes}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {totals.totalOvertimeMinutes}
                </DetailTableTd>
              </DetailTableFootRow>
            </DetailTableFoot>
          </DetailTable>
        </div>
      )}
    </section>
  )
}
