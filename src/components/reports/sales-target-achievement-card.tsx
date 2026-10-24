import type {
  SalesTargetAchievement,
  SalesTargetAchievementRow,
} from "@/lib/reports/sales-target-achievement"
import {
  SALES_TARGET_MODIFIED_BADGE_PREFIX,
  SALES_TARGET_NO_TARGET_LABEL,
  SALES_TARGET_PARTIAL_PERIOD_LABEL,
} from "@/lib/reports/sales-target-achievement"
import { formatCurrency, formatDate, formatPercentage } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-22-088-S + F-2026-10-24-131-V tahap 2: laporan "Target vs
 * Pencapaian Penjualan" basis NETO. Murni presentasi dari builder server:
 * komponen bruto/retur/neto, persen, selisih, dan temuan plafon ditempel
 * apa adanya — UI tidak menghitung pengurang (negatif tampil negatif).
 * Notice §6 verbatim dari builder.
 */

function badge(text: string) {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
      {text}
    </span>
  )
}

function periodLabel(row: SalesTargetAchievementRow): string {
  if (!row.periodStart || !row.periodEnd) return SALES_TARGET_NO_TARGET_LABEL
  return `${formatDate(row.periodStart, { format: "numeric" })} – ${formatDate(row.periodEnd, { format: "numeric" })}`
}

function TargetRow({ row }: Readonly<{ row: SalesTargetAchievementRow }>) {
  return (
    <DetailTableRow>
      <DetailTableTd className="font-medium">
        {row.salesEmployeeName || "—"}
        {!row.periodFullyContained && row.hasTarget
          ? badge(SALES_TARGET_PARTIAL_PERIOD_LABEL)
          : null}
        {row.modifiedAfterPeriodStartAt
          ? badge(
              `${SALES_TARGET_MODIFIED_BADGE_PREFIX} ${formatDate(row.modifiedAfterPeriodStartAt, { format: "numeric" })}`,
            )
          : null}
        {row.notes ? <span className="block text-xs font-normal text-muted-foreground">{row.notes}</span> : null}
      </DetailTableTd>
      <DetailTableTd>{periodLabel(row)}</DetailTableTd>
      <DetailTableTd align="right">
        {row.targetAmount !== null ? formatCurrency(row.targetAmount) : SALES_TARGET_NO_TARGET_LABEL}
      </DetailTableTd>
      <DetailTableTd align="right">{formatCurrency(row.grossPaidAmount)}</DetailTableTd>
      <DetailTableTd align="right">{formatCurrency(row.returnDeductionAmount)}</DetailTableTd>
      <DetailTableTd align="right">{row.returnCount}</DetailTableTd>
      <DetailTableTd align="right">{formatCurrency(row.achievedAmount)}</DetailTableTd>
      <DetailTableTd align="right">
        {row.achievementPercent !== null ? formatPercentage(row.achievementPercent, 2) : ""}
      </DetailTableTd>
      <DetailTableTd align="right">
        {row.gapAmount !== null ? formatCurrency(row.gapAmount) : ""}
      </DetailTableTd>
      <DetailTableTd align="right">{row.invoiceCount}</DetailTableTd>
    </DetailTableRow>
  )
}

export function SalesTargetAchievementCard({
  report,
}: Readonly<{ report: SalesTargetAchievement }>) {
  const showUnattributed =
    report.unattributed.invoiceCount > 0 || report.unattributed.returnDeductionAmount !== 0
  const isEmpty =
    report.rows.length === 0 && report.noTargetRows.length === 0 && !showUnattributed

  return (
    <ReportCardShell
      label="target vs pencapaian penjualan"
      title="Target vs Pencapaian Penjualan"
      summary={<>{report.notice}</>}
      isEmpty={isEmpty}
      emptyText="Tidak ada target atau faktur lunas pada masa ini."
    >
      <span className="hidden" data-report-narration={report.notice} aria-hidden="true" />
      <DetailTable data-report-table="target vs pencapaian penjualan">
        <DetailTableHead>
          <DetailTableTh>Penjual</DetailTableTh>
          <DetailTableTh>Periode Target</DetailTableTh>
          <DetailTableTh align="right">Target (Rp)</DetailTableTh>
          <DetailTableTh align="right">Bruto Lunas (Rp)</DetailTableTh>
          <DetailTableTh align="right">Retur (Rp)</DetailTableTh>
          <DetailTableTh align="right">Retur</DetailTableTh>
          <DetailTableTh align="right">Pencapaian Neto (Rp)</DetailTableTh>
          <DetailTableTh align="right">Pencapaian (%)</DetailTableTh>
          <DetailTableTh align="right">Selisih (Rp)</DetailTableTh>
          <DetailTableTh align="right">Faktur Lunas</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {report.rows.map((row) => (
            <TargetRow key={row.targetId ?? `t-${row.salesEmployeeId}`} row={row} />
          ))}
          {report.noTargetRows.map((row) => (
            <TargetRow key={`nt-${row.salesEmployeeId}`} row={row} />
          ))}
          {showUnattributed ? (
            <DetailTableRow>
              <DetailTableTd className="font-medium">{report.unattributed.label}</DetailTableTd>
              <DetailTableTd>{SALES_TARGET_NO_TARGET_LABEL}</DetailTableTd>
              <DetailTableTd align="right">{SALES_TARGET_NO_TARGET_LABEL}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(report.unattributed.grossPaidAmount)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(report.unattributed.returnDeductionAmount)}</DetailTableTd>
              <DetailTableTd align="right">{""}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(report.unattributed.achievedAmount)}</DetailTableTd>
              <DetailTableTd align="right">{""}</DetailTableTd>
              <DetailTableTd align="right">{""}</DetailTableTd>
              <DetailTableTd align="right">{report.unattributed.invoiceCount}</DetailTableTd>
            </DetailTableRow>
          ) : null}
        </DetailTableBody>
        <DetailTableFoot>
          <DetailTableFootRow>
            <DetailTableTd className="font-bold">Total</DetailTableTd>
            <DetailTableTd>{""}</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(report.totalTargetAmount)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(report.totalGrossPaidAmount)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(report.totalReturnDeductionAmount)}
            </DetailTableTd>
            <DetailTableTd align="right">{""}</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(report.totalAchievedAmount)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {report.companyPercent !== null ? formatPercentage(report.companyPercent, 2) : ""}
            </DetailTableTd>
            <DetailTableTd align="right">{""}</DetailTableTd>
            <DetailTableTd align="right">{""}</DetailTableTd>
          </DetailTableFootRow>
        </DetailTableFoot>
      </DetailTable>
      {report.invoiceDeductionClampFindings.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Temuan plafon pengurang per faktur</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {report.invoiceDeductionClampFindings.map((finding) => (
              <li key={finding.salesInvoiceId}>
                Faktur #{finding.salesInvoiceId}: pengurang mentah{" "}
                {formatCurrency(finding.rawDeductionAmount)} ditahan pada total faktur{" "}
                {formatCurrency(finding.grandTotal)} menjadi{" "}
                {formatCurrency(finding.clampedDeductionAmount)}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ReportCardShell>
  )
}
