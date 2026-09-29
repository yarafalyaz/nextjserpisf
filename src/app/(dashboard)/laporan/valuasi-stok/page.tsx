export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Valuasi Stok" }

export default async function StockValuationPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouseId?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams
  const warehouseId = params.warehouseId ? parseInt(params.warehouseId) : null

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: 'asc' },
  })

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

  const warehouseMap = new Map(warehouses.map((w) => [w.id, { name: w.name, code: w.code }]))

  const aggregated = new Map<string, { sku: string; name: string; uom: string; category: string; warehouse: string; warehouseCode: string; qty: number; value: number; costingMethod: string }>()
  for (const layer of layers) {
    const wh = warehouseMap.get(layer.warehouseId ?? 0)
    const key = `${layer.itemId}-${layer.warehouseId || 0}`
    const method = (layer.item.category?.costingMethod || layer.item.costingMethod || "fifo").toLowerCase()
    const existing = aggregated.get(key) || {
      sku: layer.item.sku, name: layer.item.name, uom: layer.item.unitOfMeasure,
      category: layer.item.category?.name || '-', warehouse: wh?.name || '-', warehouseCode: wh?.code || '-', qty: 0, value: 0,
      costingMethod: method.toUpperCase(),
    }
    const remaining = Number(layer.remaining)
    existing.qty += remaining
    if (method === "average") {
      existing.value += remaining * Number(layer.item.cost ?? 0)
    } else {
      existing.value += remaining * Number(layer.unitCost)
    }
    aggregated.set(key, existing)
  }

  const rows = Array.from(aggregated.values()).sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode) || a.sku.localeCompare(b.sku))
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const totalValue = rows.reduce((s, r) => s + r.value, 0)

  const warehouseSummary = new Map<string, { name: string; items: number; qty: number; value: number }>()
  for (const row of rows) {
    const existing = warehouseSummary.get(row.warehouseCode) || { name: row.warehouse, items: 0, qty: 0, value: 0 }
    existing.items++; existing.qty += row.qty; existing.value += row.value
    warehouseSummary.set(row.warehouseCode, existing)
  }

  const periodLabel = `Per ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" }, { label: "Laporan", href: "/laporan" }, { label: "Valuasi Stok" },
        ]} />
      </div>
      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Valuasi_Stok" />
      </div>
      <form className="mb-2 flex items-center gap-4 flex-wrap print:hidden">
        <div className="flex flex-col gap-1.5 w-[220px]">
          <Label htmlFor="warehouseId">Gudang</Label>
          <FormSelect id="warehouseId" name="warehouseId" defaultValue={params.warehouseId || undefined}
            placeholder="Semua Gudang"
            options={warehouses.map(w => ({ value: String(w.id), label: `${w.code} - ${w.name}` }))} />
        </div>
        <Button type="submit" variant="primary" size="sm">Filter</Button>
      </form>
      <ReportLetterhead title="Valuasi Stok per Gudang" subtitle="Stock Valuation" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Valuasi Stok menunjukkan nilai persediaan barang berdasarkan metode penilaian yang digunakan perusahaan. Informasi ini membantu dalam pengendalian persediaan, perencanaan pembelian, dan penilaian aset lancar perusahaan." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Item" value={rows.length.toLocaleString('id-ID')} />
        <ReportKpiCard label="Total Qty" value={totalQty.toLocaleString('id-ID')} />
        <ReportKpiCard label="Total Nilai" value={formatCurrency(totalValue)} valueClassName="text-primary" />
        <ReportKpiCard label="Gudang Aktif" value={warehouseSummary.size.toLocaleString('id-ID')} />
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
                  <DetailTableTd align="right">{ws.qty.toLocaleString('id-ID')}</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatAccounting(ws.value)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </ReportSection>
      )}
      <ReportSection title={`Detail Valuasi Stok (${rows.length} baris)`}>
        <DetailTable data-report-table="Stock Valuation">
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
                <DetailTableTd className="text-xs font-semibold text-muted-foreground">{row.costingMethod}</DetailTableTd>
                <DetailTableTd align="right">{row.qty.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.qty > 0 ? row.value / row.qty : 0)}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold">{formatAccounting(row.value)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={9} className="text-center text-muted-foreground py-8">Tidak ada data persediaan</DetailTableTd></DetailTableRow>
            )}
            {rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={6}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{totalQty.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right">-</DetailTableTd>
                <DetailTableTd align="right" className="text-primary">{formatAccounting(totalValue)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </div>
  )
}
