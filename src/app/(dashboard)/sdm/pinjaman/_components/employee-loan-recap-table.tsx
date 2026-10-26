import Link from "next/link"
import {
  EMPLOYEE_LOAN_RECAP_INACTIVE_LABEL,
  EMPLOYEE_LOAN_RECAP_NEGATIVE_LABEL,
  EMPLOYEE_LOAN_RECAP_NO_DEPARTMENT_LABEL,
  EMPLOYEE_LOAN_RECAP_NO_WEEKLY_LABEL,
  EMPLOYEE_LOAN_RECAP_PENDING_LABEL,
  EMPLOYEE_LOAN_RECAP_UNKNOWN_STATUS_LABEL,
  type EmployeeLoanRecap,
} from "@/lib/reports/employee-loan-recap"
import { formatCurrency, formatDate } from "@/lib/utils/format"
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

function nameOrId(employeeId: number, name: string | null): string {
  return name ?? `Karyawan #${employeeId}`
}

/**
 * Rekap sisa pinjaman aktif per karyawan (F-2026-10-25-046-S, AC-LR46-F1/F2).
 *
 * Murni presentasi payload `loadEmployeeLoanRecap` server: notice, angka,
 * ember, dan total ditempel apa adanya — UI tidak menjumlah ulang, tidak
 * memproyeksikan potongan/lunas, tidak meng-clamp sisa negatif, dan tidak
 * menampilkan nominal gaji. Cicilan bulanan dan mingguan adalah dua kolom
 * terpisah berlabel frekuensi (BR-LR46-04); penanda nonaktif/negatif/status
 * tak dikenal berasal dari payload server, bukan ditebak UI.
 */
export function EmployeeLoanRecapTable({ recap }: Readonly<{ recap: EmployeeLoanRecap }>) {
  const { totals } = recap
  const isEmpty = recap.employees.length === 0

  return (
    <section aria-label="Rekap sisa pinjaman per karyawan" className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{recap.notice}</p>

      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-label="Ringkasan rekap pinjaman"
      >
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Karyawan berpinjaman</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.employeeCount}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pinjaman aktif</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.activeCount}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total sisa pinjaman aktif</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(totals.totalRemainingActive)}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{EMPLOYEE_LOAN_RECAP_PENDING_LABEL}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{totals.pendingCount}</p>
        </div>
      </div>

      {isEmpty ? (
        <p className="rounded-xl border border-default bg-surface px-4 py-10 text-center text-sm text-muted-foreground">
          Tidak ada pinjaman aktif atau menunggu persetujuan pada cakupan ini.
        </p>
      ) : (
        <div>
          <h2 className="mb-2 text-base font-semibold text-foreground">Per karyawan</h2>
          <DetailTable data-report-table="Rekap sisa pinjaman per karyawan">
            <DetailTableHead>
              <DetailTableTh>Karyawan</DetailTableTh>
              <DetailTableTh>Departemen</DetailTableTh>
              <DetailTableTh align="right">Pinjaman aktif</DetailTableTh>
              <DetailTableTh align="right">Pokok aktif</DetailTableTh>
              <DetailTableTh align="right">Sisa pinjaman</DetailTableTh>
              <DetailTableTh align="right">Terbayar tercatat</DetailTableTh>
              <DetailTableTh align="right">Cicilan bulanan</DetailTableTh>
              <DetailTableTh align="right">Cicilan mingguan</DetailTableTh>
              <DetailTableTh>Pinjaman aktif tertua</DetailTableTh>
              <DetailTableTh>Catatan</DetailTableTh>
              <DetailTableTh>Daftar pinjaman</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {recap.employees.map((employee) => (
                <DetailTableRow key={employee.employeeId}>
                  <DetailTableTd>{nameOrId(employee.employeeId, employee.employeeName)}</DetailTableTd>
                  <DetailTableTd>
                    {employee.departmentName ?? EMPLOYEE_LOAN_RECAP_NO_DEPARTMENT_LABEL}
                  </DetailTableTd>
                  <DetailTableTd align="right">{employee.activeCount}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(employee.totalPrincipalActive)}</DetailTableTd>
                  <DetailTableTd align="right">
                    <span className={employee.hasNegativeRemaining ? "font-semibold text-destructive" : undefined}>
                      {formatCurrency(employee.totalRemainingActive)}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(employee.totalPaidDerived)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(employee.monthlyInstallmentTotal)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(employee.weeklyInstallmentTotal)}</DetailTableTd>
                  <DetailTableTd>
                    {employee.oldestActiveLoanDate
                      ? formatDate(employee.oldestActiveLoanDate, { format: "short" })
                      : "—"}
                  </DetailTableTd>
                  <DetailTableTd>
                    <span className="flex flex-col gap-1">
                      {employee.isInactiveWithActiveLoans ? (
                        <span>{EMPLOYEE_LOAN_RECAP_INACTIVE_LABEL}</span>
                      ) : null}
                      {employee.hasNegativeRemaining ? (
                        <span className="font-semibold text-destructive">
                          {`${EMPLOYEE_LOAN_RECAP_NEGATIVE_LABEL} (${employee.negativeRemainingCount} pinjaman)`}
                        </span>
                      ) : null}
                      {employee.activeWithoutWeeklyCount > 0 ? (
                        <span>{`${EMPLOYEE_LOAN_RECAP_NO_WEEKLY_LABEL} (${employee.activeWithoutWeeklyCount} pinjaman)`}</span>
                      ) : null}
                      {employee.pendingCount > 0 ? (
                        <span>{`${EMPLOYEE_LOAN_RECAP_PENDING_LABEL} (${employee.pendingCount})`}</span>
                      ) : null}
                      {employee.unknownStatusCount > 0 ? (
                        <span>
                          {`${EMPLOYEE_LOAN_RECAP_UNKNOWN_STATUS_LABEL} (${employee.unknownStatusCount}): ${employee.unknownStatuses.join(", ")}`}
                        </span>
                      ) : null}
                      {!employee.isInactiveWithActiveLoans &&
                      !employee.hasNegativeRemaining &&
                      employee.activeWithoutWeeklyCount === 0 &&
                      employee.pendingCount === 0 &&
                      employee.unknownStatusCount === 0
                        ? "—"
                        : null}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>
                    <Link
                      href={`/sdm/pinjaman?cari=${encodeURIComponent(nameOrId(employee.employeeId, employee.employeeName))}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      Lihat daftar
                    </Link>
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
                  {totals.activeCount}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {formatCurrency(totals.totalPrincipalActive)}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {formatCurrency(totals.totalRemainingActive)}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {formatCurrency(totals.totalPaidDerived)}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {formatCurrency(totals.monthlyInstallmentTotal)}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-bold">
                  {formatCurrency(totals.weeklyInstallmentTotal)}
                </DetailTableTd>
                <DetailTableTd className="font-bold">—</DetailTableTd>
                <DetailTableTd className="font-bold">
                  <span className="flex flex-col gap-1">
                    {totals.inactiveWithActiveLoansCount > 0 ? (
                      <span>{`${EMPLOYEE_LOAN_RECAP_INACTIVE_LABEL} (${totals.inactiveWithActiveLoansCount} karyawan)`}</span>
                    ) : null}
                    {totals.negativeRemainingCount > 0 ? (
                      <span className="text-destructive">
                        {`${EMPLOYEE_LOAN_RECAP_NEGATIVE_LABEL} (${totals.negativeRemainingCount} pinjaman)`}
                      </span>
                    ) : null}
                    {totals.activeWithoutWeeklyCount > 0 ? (
                      <span>{`${EMPLOYEE_LOAN_RECAP_NO_WEEKLY_LABEL} (${totals.activeWithoutWeeklyCount} pinjaman)`}</span>
                    ) : null}
                    {totals.pendingCount > 0 ? (
                      <span>{`${EMPLOYEE_LOAN_RECAP_PENDING_LABEL} (${totals.pendingCount})`}</span>
                    ) : null}
                    {totals.unknownStatusCount > 0 ? (
                      <span>{`${EMPLOYEE_LOAN_RECAP_UNKNOWN_STATUS_LABEL} (${totals.unknownStatusCount})`}</span>
                    ) : null}
                    {totals.inactiveWithActiveLoansCount === 0 &&
                    totals.negativeRemainingCount === 0 &&
                    totals.activeWithoutWeeklyCount === 0 &&
                    totals.pendingCount === 0 &&
                    totals.unknownStatusCount === 0
                      ? "—"
                      : null}
                  </span>
                </DetailTableTd>
                <DetailTableTd className="font-bold">—</DetailTableTd>
              </DetailTableFootRow>
            </DetailTableFoot>
          </DetailTable>
        </div>
      )}
    </section>
  )
}
