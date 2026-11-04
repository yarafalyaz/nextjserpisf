export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/auth/permissions'
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import { loadStockReconciliation } from "@/lib/reports/stock-simple-data"
import { formatCurrencyExact, formatAccountingExact, formatDate, formatNumber } from "@/lib/utils/format"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { buildReportPeriodSlug } from "@/lib/reports/report-period"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Rekonsiliasi Stok" }

export default async function StockReconciliationPage() {
  const user = await requirePermission('view_reports')
  const scope = await getWarehouseScope({ id: user.id, roles: user.roles ?? [] })
  const scopeWarehouseIds = scope.kind === 'all'
    ? undefined
    : scope.kind === 'assigned'
      ? scope.warehouseIds
      : []
  const { summary } = await loadStockReconciliation(scopeWarehouseIds)

  const periodLabel = `Per ${formatDate(new Date())}`

  return (
    <ReportPageShell title="Rekonsiliasi Stok" sheet={false} wide actions={<>
<div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Rekonsiliasi_Stok" pdfHref={buildReportPdfHref("rekonsiliasi-stok", buildReportPeriodSlug(new Date(), new Date()))} />
      </div>
</>}>




      <ReportLetterhead title="Rekonsiliasi Stok" subtitle="Rekonsiliasi Persediaan" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Rekonsiliasi Stok membandingkan jumlah stok pada data induk barang (qty on-hand) dengan jumlah pada lapisan FIFO (lot per gudang). Keduanya seharusnya selalu sama; selisih menandakan ada mutasi yang memperbarui salah satu saja, sehingga angka stok bisa menyesatkan. Gunakan laporan ini sebagai alat kontrol integritas persediaan." />
      {scopeWarehouseIds !== undefined && (
        <p className="doc-lines">
          Cakupan gudang: item hanya tampil bila punya lapisan FIFO di gudang Anda. Kuantitas Induk,
          Kuantitas FIFO, Selisih, dan Nilai FIFO adalah total global semua gudang.
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Item" value={formatNumber(summary.totalItems)} />
        <ReportKpiCard
          label="Item Selisih"
          value={formatNumber(summary.mismatchCount)}
          valueClassName={summary.mismatchCount > 0 ? 'text-danger' : 'text-success'}
        />
        <ReportKpiCard label="Total Qty (Induk)" value={formatNumber(summary.totalMasterQty)} />
        <ReportKpiCard label="Total Qty (FIFO)" value={formatNumber(summary.totalLayerQty)} />
        <ReportKpiCard label="Nilai Persediaan (FIFO)" value={formatCurrencyExact(summary.totalLayerValue)} valueClassName="text-primary" />
      </div>

      <ReportSection title={`Item Selisih (${summary.mismatches.length})`}>
        <DetailTable data-report-table="Item Selisih">
          <DetailTableHead>
            <DetailTableTh>SKU</DetailTableTh>
            <DetailTableTh>Nama Item</DetailTableTh>
            <DetailTableTh align="right">Kuantitas Induk</DetailTableTh>
            <DetailTableTh align="right">Kuantitas FIFO</DetailTableTh>
            <DetailTableTh align="right">Selisih</DetailTableTh>
            <DetailTableTh align="right">Nilai FIFO</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {summary.mismatches.map((row) => (
              <DetailTableRow key={row.itemId}>
                <DetailTableTd className="font-mono text-sm">{row.sku}</DetailTableTd>
                <DetailTableTd className="font-medium">{row.name}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(row.masterQty)}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(row.layerQty)}</DetailTableTd>
                <DetailTableTd
                  align="right"
                  className={row.variance > 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}
                >
                  {row.variance > 0 ? '+' : ''}{formatNumber(row.variance)}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-semibold">{formatAccountingExact(row.layerValue)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {summary.mismatches.length === 0 && (
              <DetailTableRow>
                <DetailTableTd colSpan={6} className="text-center text-success py-8">
                  {scopeWarehouseIds !== undefined
                    ? "Tidak ada selisih pada item yang tampil dalam cakupan gudang."
                    : "Semua item seimbang — jumlah induk sama dengan total lapisan FIFO."}
                </DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}
