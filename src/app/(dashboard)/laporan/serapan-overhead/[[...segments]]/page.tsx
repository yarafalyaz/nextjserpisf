export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/auth/permissions'
import { getSystemSettings } from '@/lib/utils/settings'
import { formatCurrency, formatPeriod } from '@/lib/utils/format'
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildOverheadAbsorptionReport } from "@/lib/services/overhead-absorption.service"
import { OVERHEAD_DRIVER_LABELS, type OverheadDriver } from "@/lib/validations/production-cost.schemas"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Serapan Overhead (Under/Over-Absorption)" }

export default async function OverheadAbsorptionPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ periode?: string }>
}) {
  await requirePermission('view_reports')

  // Laporan bulanan: periodenya cukup YYYY-MM. Tautan lama (?periode=) tetap dibaca.
  const routePeriod = await reportPeriodFromRoute(
    routeParams,
    searchParams,
    (now) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    { legacyParam: "periode" },
  )
  const period = toLocalDateOnly(routePeriod.start).slice(0, 7)

  const settings = await getSystemSettings()
  // Actual overhead is read from the configured expense accounts (no dedicated
  // overhead account exists). Both are optional; when unset the report flags it.
  const overheadAccountIds = [settings.generalExpenseAccountId, settings.materialExpenseAccountId].filter(
    (id): id is number => Number.isInteger(id) && (id as number) > 0,
  )

  const result = await buildOverheadAbsorptionReport(period, overheadAccountIds)
  const overAbsorbed = result.variance > 0
  const varianceLabel = result.variance === 0 ? "Terserap Pas" : overAbsorbed ? "Over-Absorbed" : "Under-Absorbed"

  const periodLabel = formatPeriod(period)

  return (
    <ReportPageShell title="Serapan Overhead (Kurang/Lebih Serap)" sheet={false} wide filter={<>
<ReportPeriodFilter basePath="/laporan/serapan-overhead" mode="month" defaultStartDate={period} />
</>} actions={<>
<div className="flex items-center justify-end print:hidden"><ExportButtons title="Serapan_Overhead" /></div>
</>}>




      <ReportLetterhead title="Serapan Overhead" subtitle="Overhead Dibebankan vs Aktual (Kurang/Lebih Serap)" periodLabel={`Periode ${periodLabel}`} />
      <ReportNarration text="Overhead produksi dibebankan ke perintah produksi memakai dasar yang dapat diaudit (jam mesin, jam tenaga kerja, kuantitas, atau SKF): dibebankan = kuantitas dasar × tarif. Laporan ini membandingkan overhead yang sudah dibebankan ke perintah produksi dengan overhead aktual pada akun beban terkait, dan menampilkan selisihnya. Dibebankan > aktual berarti kelebihan serap (perintah produksi dibebani lebih dari biaya nyata); dibebankan < aktual berarti kekurangan serap (ada biaya nyata yang belum terbawa ke HPP perintah produksi). Jangan membebankan listrik/depresiasi dua kali (FAB-07)." />

      {result.accountUnconfigured && (
        <div className="rounded-lg border border-warning bg-warning/10 p-3 text-sm text-foreground print:hidden">
          Akun beban overhead belum dikonfigurasi di Pengaturan, sehingga sisi <strong>aktual</strong> ditampilkan 0 dan selisihnya belum bermakna. Setel akun beban umum (atau beban material) untuk rekonsiliasi yang benar.
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Overhead Dibebankan" value={formatCurrency(result.appliedTotal)} />
        <ReportKpiCard label="Overhead Aktual" value={formatCurrency(result.actualTotal)} />
        <ReportKpiCard
          label={`Selisih (${varianceLabel})`}
          value={formatCurrency(Math.abs(result.variance))}
          valueClassName={result.variance === 0 ? "" : overAbsorbed ? "text-warning" : "text-danger"}
        />
        <ReportKpiCard label="Diantaranya Manual" value={formatCurrency(result.manualOverheadTotal)} />
      </div>

      <ReportSection title="Rincian Overhead Dibebankan per Perintah Produksi">
        <DetailTable data-report-table="Serapan Overhead">
          <DetailTableHead>
            <DetailTableTh>Perintah Produksi</DetailTableTh>
            <DetailTableTh>Dasar Alokasi</DetailTableTh>
            <DetailTableTh align="right">Dibebankan</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {result.lines.map((l) => (
              <DetailTableRow key={`${l.productionOrderId}-${l.driverType ?? "manual"}`}>
                <DetailTableTd className="font-medium">{l.documentNo}</DetailTableTd>
                <DetailTableTd>
                  {l.driverType ? (OVERHEAD_DRIVER_LABELS[l.driverType as OverheadDriver] ?? l.driverType) : "Manual"}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-semibold">{formatCurrency(l.applied)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {result.lines.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={3} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada overhead dibebankan pada periode ini" className="py-0" /></DetailTableTd></DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}
