export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/auth/permissions'
import { getSystemSettings } from '@/lib/utils/settings'
import { formatCurrency } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { buildOverheadAbsorptionReport } from "@/lib/services/overhead-absorption.service"
import { OVERHEAD_DRIVER_LABELS, type OverheadDriver } from "@/lib/validations/production-cost.schemas"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Serapan Overhead (Under/Over-Absorption)" }

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export default async function OverheadAbsorptionPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.periode ?? "") ? (params.periode as string) : currentPeriod()

  const settings = await getSystemSettings()
  // Actual overhead is read from the configured expense accounts (no dedicated
  // overhead account exists). Both are optional; when unset the report flags it.
  const overheadAccountIds = [settings.generalExpenseAccountId, settings.materialExpenseAccountId].filter(
    (id): id is number => Number.isInteger(id) && (id as number) > 0,
  )

  const result = await buildOverheadAbsorptionReport(period, overheadAccountIds)
  const overAbsorbed = result.variance > 0
  const varianceLabel = result.variance === 0 ? "Terserap Pas" : overAbsorbed ? "Over-Absorbed" : "Under-Absorbed"

  const [yearStr, monthStr] = period.split("-")
  const periodLabel = new Date(Number(yearStr), Number(monthStr) - 1, 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Laporan", href: "/laporan" }, { label: "Serapan Overhead" }]} />
      </div>
      <div className="flex items-center justify-end print:hidden"><ExportButtons title="Serapan_Overhead" /></div>
      <form className="mb-2 flex items-end gap-4 flex-wrap print:hidden">
        <div className="flex flex-col gap-1.5 w-[180px]">
          <Label htmlFor="periode">Periode (YYYY-MM)</Label>
          <Input id="periode" name="periode" type="month" defaultValue={period} />
        </div>
        <Button type="submit" variant="primary" size="sm">Tampilkan</Button>
      </form>

      <ReportLetterhead title="Serapan Overhead" subtitle="Overhead Applied vs Actual (Under/Over-Absorption)" periodLabel={`Periode ${periodLabel}`} />
      <ReportNarration text="Overhead produksi dibebankan ke job memakai dasar yang dapat diaudit (jam mesin, jam tenaga kerja, kuantitas, atau SKF): applied = kuantitas driver × tarif. Laporan ini membandingkan overhead yang sudah dibebankan ke job (applied) dengan overhead aktual pada akun beban terkait, dan menampilkan selisihnya. Applied > aktual berarti over-absorbed (job dibebani lebih dari biaya nyata); applied < aktual berarti under-absorbed (ada biaya nyata yang belum terbawa ke HPP job). Jangan membebankan listrik/depresiasi dua kali (FAB-07)." />

      {result.accountUnconfigured && (
        <div className="rounded-lg border border-warning bg-warning/10 p-3 text-sm text-foreground print:hidden">
          Akun beban overhead belum dikonfigurasi di Pengaturan, sehingga sisi <strong>aktual</strong> ditampilkan 0 dan selisihnya belum bermakna. Setel akun beban umum (atau beban material) untuk rekonsiliasi yang benar.
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Overhead Applied" value={formatCurrency(result.appliedTotal)} />
        <ReportKpiCard label="Overhead Aktual" value={formatCurrency(result.actualTotal)} />
        <ReportKpiCard
          label={`Selisih (${varianceLabel})`}
          value={formatCurrency(Math.abs(result.variance))}
          valueClassName={result.variance === 0 ? "" : overAbsorbed ? "text-warning" : "text-danger"}
        />
        <ReportKpiCard label="Diantaranya Manual" value={formatCurrency(result.manualOverheadTotal)} />
      </div>

      <ReportSection title="Rincian Overhead Applied per Perintah Produksi">
        <DetailTable data-report-table="Serapan Overhead">
          <DetailTableHead>
            <DetailTableTh>Perintah Produksi</DetailTableTh>
            <DetailTableTh>Dasar Alokasi</DetailTableTh>
            <DetailTableTh align="right">Applied</DetailTableTh>
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
              <DetailTableRow><DetailTableTd colSpan={3} className="text-center text-muted-foreground py-6">Tidak ada overhead applied pada periode ini</DetailTableTd></DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </div>
  )
}
