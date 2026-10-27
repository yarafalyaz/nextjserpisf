import { formatCurrency, formatAccounting, formatDate } from "@/lib/utils/format"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { buildReportPeriodSlug } from "@/lib/reports/report-period"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { AGING_BUCKETS, agingBucket, daysOverdue } from "@/lib/reports/aging"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { AgingChart } from "@/components/lazy/aging-chart"

export interface AgingRowInput {
  party: string
  documentNo: string
  dueDate: Date | null
  grandTotal: unknown
  paidAmount: unknown
  /** F-104-V opsional (piutang saja): returnCredit jurnal SalesReturn POSTED
   * faktur ini dari loader — pengurang sisa, BUKAN bagian paidAmount.
   * Hutang tidak mengisinya (perilaku lama persis). */
  returnCreditAmount?: unknown
}

export interface AgingReportTexts {
  pageTitle: string
  exportTitle: string
  pdfSlug: "hutang-jatuh-tempo" | "piutang-jatuh-tempo"
  letterheadSubtitle: string
  narration: string
  kpiLabel: string
  summaryTitle: string
  chartTitle: string
  chartValueLabel: string
  chartAriaLabel: string
  detailTitle: string
  partyHeader: string
  documentHeader: string
  emptyText: string
  outstandingClassName: string
  wrapActionsInDiv?: boolean
}

export function buildAgingRows(items: AgingRowInput[], now: Date) {
  return items
    .map((item) => {
      if (!item.dueDate) return null
      // F-104-V: sisa = grandTotal − paidAmount − returnCredit (definisi
      // outstanding tunggal vonis; returnCredit dari loader, default 0 =
      // perilaku lama persis, mis. permukaan hutang).
      const outstanding = Number(item.grandTotal) - Number(item.paidAmount) - Number(item.returnCreditAmount ?? 0)
      if (outstanding <= 0) return null
      const dueDate = new Date(item.dueDate)
      const overdue = daysOverdue(dueDate, now)
      return {
        party: item.party,
        documentNo: item.documentNo,
        dueDate,
        overdueDays: overdue,
        ageGroup: agingBucket(overdue),
        outstanding,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.overdueDays - a.overdueDays)
}

export function AgingReportView({ rows, texts }: { rows: ReturnType<typeof buildAgingRows>; texts: AgingReportTexts }) {
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)

  const agingSummary = new Map<string, { count: number; total: number }>()
  for (const row of rows) {
    const existing = agingSummary.get(row.ageGroup) || { count: 0, total: 0 }
    existing.count++
    existing.total += row.outstanding
    agingSummary.set(row.ageGroup, existing)
  }
  const agingGroups = AGING_BUCKETS.map((key) => ({
    key,
    count: agingSummary.get(key)?.count || 0,
    total: agingSummary.get(key)?.total || 0,
  }))
  const period = `Per ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`

  const exportButtons = (
    <ExportButtons title={texts.exportTitle} pdfHref={buildReportPdfHref(texts.pdfSlug, buildReportPeriodSlug(new Date(), new Date()))} />
  )

  return (
    <ReportPageShell
      title={texts.pageTitle}
      sheet={false}
      wide
      actions={
        texts.wrapActionsInDiv ? (
          <>
            <div className="flex items-center justify-end print:hidden">{exportButtons}</div>
          </>
        ) : (
          <>{exportButtons}</>
        )
      }
    >
      <ReportLetterhead title={texts.pageTitle} subtitle={texts.letterheadSubtitle} periodLabel={period} />
      <ReportNarration text={texts.narration} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label={texts.kpiLabel} value={formatCurrency(totalOutstanding)} />
      </div>

      <ReportSection title={texts.summaryTitle}>
        <DetailTable data-report-table={texts.summaryTitle}>
          <DetailTableHead>
            <DetailTableTh>Kategori</DetailTableTh>
            <DetailTableTh align="right">Jumlah</DetailTableTh>
            <DetailTableTh align="right">Total (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {agingGroups.map((g) => (
              <DetailTableRow key={g.key}>
                <DetailTableTd>{g.key}</DetailTableTd>
                <DetailTableTd align="right">{g.count}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(g.total)}</DetailTableTd>
              </DetailTableRow>
            ))}
            <DetailTableRow className="font-bold border-t-2 border-default">
              <DetailTableTd>TOTAL</DetailTableTd>
              <DetailTableTd align="right">{rows.length}</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(totalOutstanding)}</DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title={texts.chartTitle}>
        {/* Grafik memakai `agingGroups` yang sama dengan tabel di atas — satu sumber. */}
        <AgingChart
          data={agingGroups.map((group) => ({
            label: group.key,
            total: group.total,
            count: group.count,
          }))}
          label={texts.chartValueLabel}
          ariaLabel={texts.chartAriaLabel}
        />
      </ReportSection>

      <ReportSection title={texts.detailTitle}>
        <DetailTable data-report-table={texts.detailTitle}>
          <DetailTableHead>
            <DetailTableTh>{texts.partyHeader}</DetailTableTh>
            <DetailTableTh>{texts.documentHeader}</DetailTableTh>
            <DetailTableTh>Jatuh Tempo</DetailTableTh>
            <DetailTableTh>Umur</DetailTableTh>
            <DetailTableTh align="right">Sisa (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((r, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-medium">{r.party}</DetailTableTd>
                <DetailTableTd className="font-mono text-sm">{r.documentNo}</DetailTableTd>
                <DetailTableTd>{formatDate(r.dueDate)}</DetailTableTd>
                <DetailTableTd>{r.ageGroup}</DetailTableTd>
                <DetailTableTd align="right" className={texts.outstandingClassName}>
                  {formatAccounting(r.outstanding)}
                </DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow>
                <DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6">
                  {texts.emptyText}
                </DetailTableTd>
              </DetailTableRow>
            )}
            {rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={4}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOutstanding)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}
