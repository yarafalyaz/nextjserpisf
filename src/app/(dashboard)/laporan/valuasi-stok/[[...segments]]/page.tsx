export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatAccounting, formatCurrency, formatDate, formatNumber } from '@/lib/utils/format'
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { buildReportPeriodSlug } from "@/lib/reports/report-period"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { splitReportSegments } from "@/lib/reports/report-period"
import { buildStockValuation, toValuationLayers } from "@/lib/reports/stock-valuation"
import { getSystemSettings } from "@/lib/utils/settings"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Valuasi Stok" }

export default async function StockValuationPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ warehouseId?: string }>
}) {
  await requirePermission('view_reports')

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  // Laporan tanpa periode: segmennya langsung pasangan filter. Gudang dari path
  // (`/gudang/<slug>`); `?warehouseId=` lama tetap dibaca.
  const { filters } = splitReportSegments(segments)
  const warehouseKey = filters.gudang ?? search.warehouseId ?? null

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: 'asc' },
  })

  const warehouseRow = warehouseKey
    ? warehouses.find((w) => w.slug === warehouseKey) ?? warehouses.find((w) => String(w.id) === warehouseKey) ?? null
    : null
  const warehouseId = warehouseRow?.id ?? null

  const layers = await prisma.inventoryLayer.findMany({
    where: { remaining: { gt: 0 }, ...(warehouseId ? { warehouseId } : {}) },
    include: {
      item: {
        select: {
          id: true,
          sku: true,
          name: true,
          unitOfMeasure: true,
          cost: true,
          costingMethod: true,
          category: {
            select: {
              name: true,
              costingMethod: true,
            },
          },
        },
      },
    },
  })

  const settings = await getSystemSettings()

  const warehouseMap = new Map(warehouses.map((w) => [w.id, { name: w.name, code: w.code }]))

  // Aturan penilaian (kategori menang atas barang; metode `average` memakai
  // harga pokok barang, bukan harga lapisan) tinggal di satu berkas bersama
  // dengan laporan pemeriksaan selisih persediaan — kalau salah satunya
  // menghitung sendiri, dua laporan bisa menampilkan nilai persediaan berbeda.
  const { rows, totals } = buildStockValuation(
    toValuationLayers(layers),
    (warehouseId) => warehouseMap.get(warehouseId ?? 0),
    settings.costingMethod,
  )
  const totalQty = totals.qty
  const totalValue = totals.value

  const warehouseSummary = new Map<string, { name: string; items: number; qty: number; value: number }>()
  for (const row of rows) {
    const existing = warehouseSummary.get(row.warehouseCode) || { name: row.warehouse, items: 0, qty: 0, value: 0 }
    existing.items++; existing.qty += row.qty; existing.value += row.value
    warehouseSummary.set(row.warehouseCode, existing)
  }

  const periodLabel = `Per ${formatDate(new Date())}`

  return (
    <ReportPageShell title="Valuasi Stok" sheet={false} wide filter={<>
<ReportPeriodFilter
        basePath="/laporan/valuasi-stok"
        mode="none"
        defaultStartDate=""
        selects={[
          {
            param: "gudang",
            label: "Gudang",
            placeholder: "Semua Gudang",
            value: warehouseRow ? (warehouseRow.slug ?? String(warehouseRow.id)) : "",
            options: warehouses.map((w) => ({ value: w.slug ?? String(w.id), label: `${w.code} - ${w.name}` })),
          },
        ]}
      />
</>} actions={<>
<div className="flex items-center justify-end print:hidden">
        <ExportButtons
          title="Valuasi_Stok"
          pdfHref={buildReportPdfHref("valuasi-stok", buildReportPeriodSlug(new Date(), new Date()), warehouseRow ? { gudang: warehouseRow.slug ?? String(warehouseRow.id) } : {})}
        />
      </div>
</>}>



      <ReportLetterhead title="Valuasi Stok per Gudang" subtitle="Valuasi Persediaan" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Valuasi Stok menunjukkan nilai persediaan barang berdasarkan metode penilaian yang digunakan perusahaan. Informasi ini membantu dalam pengendalian persediaan, perencanaan pembelian, dan penilaian aset lancar perusahaan." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Item" value={formatNumber(rows.length)} />
        <ReportKpiCard label="Total Qty" value={formatNumber(totalQty)} />
        <ReportKpiCard label="Total Nilai" value={formatCurrency(totalValue)} valueClassName="text-primary" />
        <ReportKpiCard label="Gudang Aktif" value={formatNumber(warehouseSummary.size)} />
      </div>
      {!warehouseId && warehouseSummary.size > 1 && (
        <ReportSection title="Ringkasan per Gudang">
          <DetailTable data-report-table="Ringkasan per Gudang">
            <DetailTableHead>
              <DetailTableTh>Gudang</DetailTableTh>
              <DetailTableTh align="right">Jenis Item</DetailTableTh>
              <DetailTableTh align="right">Total Qty</DetailTableTh>
              <DetailTableTh align="right">Total Nilai</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {Array.from(warehouseSummary.entries()).map(([code, ws]) => (
                <DetailTableRow key={code}>
                  <DetailTableTd className="font-medium">{code} - {ws.name}</DetailTableTd>
                  <DetailTableTd align="right">{ws.items}</DetailTableTd>
                  <DetailTableTd align="right">{formatNumber(ws.qty)}</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatAccounting(ws.value)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </ReportSection>
      )}
      <ReportSection title={`Detail Valuasi Stok (${rows.length} baris)`}>
        <DetailTable data-report-table="Valuasi Stok">
          <DetailTableHead>
            <DetailTableTh>SKU</DetailTableTh><DetailTableTh>Nama Item</DetailTableTh><DetailTableTh>Kategori</DetailTableTh>
            <DetailTableTh>Gudang</DetailTableTh><DetailTableTh>Satuan</DetailTableTh><DetailTableTh>Metode</DetailTableTh>
            <DetailTableTh align="right">Jml</DetailTableTh><DetailTableTh align="right">Biaya Unit</DetailTableTh>
            <DetailTableTh align="right">Total Nilai</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-mono text-sm">{row.sku}</DetailTableTd>
                <DetailTableTd className="font-medium">{row.name}</DetailTableTd>
                <DetailTableTd>{row.category}</DetailTableTd>
                <DetailTableTd>{row.warehouseCode}</DetailTableTd>
                <DetailTableTd>{row.uom}</DetailTableTd>
                <DetailTableTd className="text-xs font-semibold text-muted-foreground">{{ FIFO: "FIFO (First-In, First-Out)", AVERAGE: "Rata-rata Bergerak" }[row.costingMethod] ?? row.costingMethod}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(row.qty)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.qty > 0 ? row.value / row.qty : 0)}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold">{formatAccounting(row.value)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={9} className="text-center text-muted-foreground py-8"><EmptyState title="Tidak ada data persediaan" className="py-0" /></DetailTableTd></DetailTableRow>
            )}
            {rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={6}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(totalQty)}</DetailTableTd>
                <DetailTableTd align="right">-</DetailTableTd>
                <DetailTableTd align="right" className="text-primary">{formatAccounting(totalValue)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}
