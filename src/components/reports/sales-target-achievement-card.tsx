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
 * F-2026-10-22-088-S: laporan "Target vs Pencapaian Penjualan".
 * Murni presentasi dari builder server — nol hitung persen/selisih di
 * client. Persen/gap null tampil kosong (bukan 0%). Notice §6 verbatim.
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
  const isEmpty =
    report.rows.length === 0 && report.noTargetRows.length === 0 && report.unattributed.invoiceCount === 0

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
          <DetailTableTh align="right">Pencapaian (Rp)</DetailTableTh>
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
          {report.unattributed.invoiceCount > 0 ? (
            <DetailTableRow>
              <DetailTableTd className="font-medium">{report.unattributed.label}</DetailTableTd>
              <DetailTableTd>{SALES_TARGET_NO_TARGET_LABEL}</DetailTableTd>
              <DetailTableTd align="right">{SALES_TARGET_NO_TARGET_LABEL}</DetailTableTd>
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
    </ReportCardShell>
  )
}
