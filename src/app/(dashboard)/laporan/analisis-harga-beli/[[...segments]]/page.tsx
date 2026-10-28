export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/format'
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { parseReportFilters } from "@/lib/reports/report-href"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { buildPurchasePriceAnalysis } from "@/lib/services/purchase-price-analysis.service"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Analisis Harga Beli Multi-Sumber" }

export default async function PurchasePriceAnalysisPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ itemId?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period
  // Barang dari path (slug lebih dulu, id sebagai cadangan); `?itemId=` lama
  // tetap dibaca supaya tautan sebelum perpindahan tidak jadi tautan mati.
  const itemKey = parseReportFilters(segments.slice(1)).barang ?? search.itemId ?? null

  const itemRow = itemKey
    ? await prisma.item.findFirst({
        where: { deletedAt: null, OR: [{ slug: itemKey }, ...(/^\d+$/.test(itemKey) ? [{ id: Number(itemKey) }] : [])] },
        select: { id: true },
      })
    : null
  const itemId = itemRow?.id ?? null

  // Items that have posted goods receipts (candidate filter options). Goods
  // receipt items carry only itemId (no Prisma relation), so resolve SKUs via a
  // separate lookup on the distinct item ids.
  const receiptItemIds = await prisma.goodsReceiptItem.findMany({
    where: { goodsReceipt: { status: 'posted' } },
    select: { itemId: true },
    distinct: ['itemId'],
  })
  const items = receiptItemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: receiptItemIds.map((r) => r.itemId) } },
        select: { id: true, slug: true, sku: true, name: true },
        orderBy: { sku: 'asc' },
        take: 500,
      })
    : []

  const { rows, bestByItem } = await buildPurchasePriceAnalysis({ startDate, endDate, itemId })

  const totalReceipts = rows.reduce((s, r) => s + r.receipts, 0)
  const totalQty = rows.reduce((s, r) => s + r.totalQty, 0)
  const totalValue = rows.reduce((s, r) => s + r.totalQty * r.avgLandedUnitCost, 0)
  // Largest landed-vs-listing uplift (a red flag that listing price is misleading).
  const maxUplift = rows.reduce((m, r) => Math.max(m, r.landedUplift), 0)
  const totalPotentialSaving = bestByItem.reduce((s, b) => s + b.savingVsWorst, 0)
  const periodLabel = `Periode ${formatDate(startDate)} – ${formatDate(endDate)}`

  return (
    <ReportPageShell title="Analisis Harga Beli Multi-Sumber" sheet={false} wide filter={<>
<ReportPeriodFilter
        basePath="/laporan/analisis-harga-beli"
        mode="range"
        defaultStartDate={toLocalDateOnly(startDate)}
        defaultEndDate={toLocalDateOnly(endDate)}
        selects={[
          {
            param: "barang",
            label: "Barang",
            placeholder: "Cari barang (SKU / nama)...",
            value: itemKey ?? "",
            options: items.map((i) => ({ value: i.slug ?? String(i.id), label: `${i.sku} — ${i.name}` })),
          },
        ]}
      />
</>} actions={<>
<div className="flex items-center justify-end print:hidden"><ExportButtons title="Analisis_Harga_Beli_Multi_Sumber" /></div>
</>}>



      <ReportLetterhead title="Analisis Harga Beli Multi-Sumber" subtitle="Perbandingan Harga Beli Antar Pemasok" periodLabel={periodLabel} />
      <ReportNarration text="Analisis ini membandingkan biaya perolehan efektif barang yang sama antar pemasok dan antar waktu, berdasarkan penerimaan barang (GRN) yang sudah diposting. Harga daftar yang murah belum tentu biaya perolehan termurah setelah ongkir, diskon, dan biaya lain — karena itu perbandingan didasarkan pada biaya perolehan per satuan, bukan harga daftar saja (PUR-08)." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Jumlah Penerimaan" value={formatNumber(totalReceipts)} />
        <ReportKpiCard label="Total Qty Diterima" value={formatNumber(totalQty)} />
        <ReportKpiCard label="Nilai Perolehan" value={formatCurrency(totalValue)} />
        <ReportKpiCard label="Kenaikan Biaya Perolehan Tertinggi" value={formatCurrency(maxUplift)} valueClassName="text-danger" />
        <ReportKpiCard label="Peluang Hemat (per unit)" value={formatCurrency(totalPotentialSaving)} valueClassName="text-success" />
      </div>

      {bestByItem.length > 0 && (
        <ReportSection title="Rekomendasi Sumber Termurah (per Barang)">
          <p className="mb-3 text-sm text-muted-foreground">
            Pemilihan didasarkan pada biaya perolehan per satuan, bukan harga daftar. Hanya barang dengan lebih dari satu sumber yang dibandingkan.
          </p>
          <DetailTable data-report-table="Rekomendasi Sumber Termurah">
            <DetailTableHead>
              <DetailTableTh>SKU</DetailTableTh>
              <DetailTableTh>Nama Barang</DetailTableTh>
              <DetailTableTh>Sumber Termurah</DetailTableTh>
              <DetailTableTh align="right">Perolehan/Unit</DetailTableTh>
              <DetailTableTh align="right">Daftar/Unit</DetailTableTh>
              <DetailTableTh align="right">Hemat vs Termahal</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {bestByItem.map((b) => (
                <DetailTableRow key={b.itemId}>
                  <DetailTableTd className="font-mono text-xs">{b.sku}</DetailTableTd>
                  <DetailTableTd className="font-medium">{b.itemName}</DetailTableTd>
                  <DetailTableTd>{b.vendorName}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(b.avgLandedUnitCost)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(b.avgListingUnitPrice)}</DetailTableTd>
                  <DetailTableTd align="right" className="text-success font-semibold">{formatCurrency(b.savingVsWorst)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </ReportSection>
      )}

      <ReportSection title="Perbandingan Biaya Perolehan per Pemasok">
        <DetailTable data-report-table="Analisis Harga Beli Multi-Sumber">
          <DetailTableHead>
            <DetailTableTh>SKU</DetailTableTh>
            <DetailTableTh>Nama Barang</DetailTableTh>
            <DetailTableTh>Pemasok</DetailTableTh>
            <DetailTableTh align="right">Penerimaan</DetailTableTh>
            <DetailTableTh align="right">Total Qty</DetailTableTh>
            <DetailTableTh align="right">Perolehan/Unit</DetailTableTh>
            <DetailTableTh align="right">Daftar/Unit</DetailTableTh>
            <DetailTableTh align="right">Kenaikan</DetailTableTh>
            <DetailTableTh align="right">Terendah</DetailTableTh>
            <DetailTableTh align="right">Tertinggi</DetailTableTh>
            <DetailTableTh>Terakhir</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((r, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-mono text-xs">{r.sku}</DetailTableTd>
                <DetailTableTd className="font-medium">{r.itemName}</DetailTableTd>
                <DetailTableTd>{r.vendorName}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(r.receipts)}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(r.totalQty)}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold">{formatCurrency(r.avgLandedUnitCost)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(r.avgListingUnitPrice)}</DetailTableTd>
                <DetailTableTd align="right" className={r.landedUplift > 0 ? 'text-danger' : 'text-success'}>
                  {r.landedUplift > 0 ? '+' : ''}{formatCurrency(r.landedUplift)}
                </DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(r.minLandedUnitCost)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(r.maxLandedUnitCost)}</DetailTableTd>
                <DetailTableTd className="text-xs">{r.lastReceiptDate ? formatDate(r.lastReceiptDate, { format: "numeric" }) : '-'}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={11} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada penerimaan barang pada periode ini" className="py-0" /></DetailTableTd></DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}
