export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { Package } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { PrintHeader } from "@/components/reports/print-header"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/page-header"

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

  // Get inventory layers grouped by item + warehouse (layer.warehouseId is the
  // canonical physical-location field; stockMove.warehouseId may differ after transfers).
  const layers = await prisma.inventoryLayer.findMany({
    where: {
      remaining: { gt: 0 },
      ...(warehouseId ? { warehouseId } : {}),
    },
    include: {
      item: { select: { id: true, sku: true, name: true, unitOfMeasure: true, category: { select: { name: true } } } },
    },
  })

  // Fetch warehouse names for display
  const warehouseMap = new Map(warehouses.map((w) => [w.id, { name: w.name, code: w.code }]))

  // Aggregate: item + warehouse → qty, value
  const aggregated = new Map<string, { sku: string; name: string; uom: string; category: string; warehouse: string; warehouseCode: string; qty: number; value: number }>()

  for (const layer of layers) {
    const wh = warehouseMap.get(layer.warehouseId ?? 0)
    const key = `${layer.itemId}-${layer.warehouseId || 0}`
    const existing = aggregated.get(key) || {
      sku: layer.item.sku,
      name: layer.item.name,
      uom: layer.item.unitOfMeasure,
      category: layer.item.category?.name || '-',
      warehouse: wh?.name || '-',
      warehouseCode: wh?.code || '-',
      qty: 0,
      value: 0,
    }
    const remaining = Number(layer.remaining)
    existing.qty += remaining
    existing.value += remaining * Number(layer.unitCost)
    aggregated.set(key, existing)
  }

  const rows = Array.from(aggregated.values()).sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode) || a.sku.localeCompare(b.sku))
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const totalValue = rows.reduce((s, r) => s + r.value, 0)

  // Per-warehouse summary
  const warehouseSummary = new Map<string, { name: string; items: number; qty: number; value: number }>()
  for (const row of rows) {
    const existing = warehouseSummary.get(row.warehouseCode) || { name: row.warehouse, items: 0, qty: 0, value: 0 }
    existing.items++
    existing.qty += row.qty
    existing.value += row.value
    warehouseSummary.set(row.warehouseCode, existing)
  }

  const period = `Per ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <PrintHeader title="Valuasi Stok per Gudang" period={period} />
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Laporan", href: "/laporan" },
        { label: "Valuasi Stok" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Package size={24} />
          <h1>Valuasi Stok per Gudang</h1>
        </div>
        <ExportButtons title="Stock_Valuation" />
      </div>

      <form className="mb-6 flex items-center gap-4 flex-wrap print:hidden">
        <div className="flex flex-col gap-1.5 w-[220px]">
          <Label htmlFor="warehouseId">Gudang</Label>
          <FormSelect
            id="warehouseId"
            name="warehouseId"
            defaultValue={params.warehouseId || undefined}
            placeholder="Semua Gudang"
            options={warehouses.map(w => ({ value: String(w.id), label: `${w.code} - ${w.name}` }))}
          />
        </div>
        <Button type="submit" variant="primary" size="sm">Filter</Button>
      </form>

      {/* KPI */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6">
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Total Item</div>
          <div className="text-xl font-bold">{rows.length}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Total Qty</div>
          <div className="text-xl font-bold">{totalQty.toLocaleString('id-ID')}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Total Nilai Persediaan</div>
          <div className="text-xl font-bold text-primary">{formatCurrency(totalValue)}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Gudang Aktif</div>
          <div className="text-xl font-bold">{warehouseSummary.size}</div>
        </div>
      </div>

      {/* Per-warehouse summary */}
      {!warehouseId && warehouseSummary.size > 1 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Ringkasan per Gudang</h2>
          </div>
          <div className="p-4 px-5">
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
                    <DetailTableTd align="right" className="font-semibold">{formatCurrency(ws.value)}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      )}

      {/* Detail Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Detail Valuasi Stok</h2>
          <span className="text-sm text-muted-foreground">{rows.length} baris</span>
        </div>
        <div className="p-4 px-5 overflow-x-auto">
          <DetailTable data-report-table="Stock Valuation">
            <DetailTableHead>
              <DetailTableTh>SKU</DetailTableTh>
              <DetailTableTh>Nama Item</DetailTableTh>
              <DetailTableTh>Kategori</DetailTableTh>
              <DetailTableTh>Gudang</DetailTableTh>
              <DetailTableTh>Satuan</DetailTableTh>
              <DetailTableTh align="right">Jml</DetailTableTh>
              <DetailTableTh align="right">Biaya Rata-rata</DetailTableTh>
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
                  <DetailTableTd align="right">{row.qty.toLocaleString('id-ID')}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(row.qty > 0 ? row.value / row.qty : 0)}</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatCurrency(row.value)}</DetailTableTd>
                </DetailTableRow>
              ))}
              {rows.length === 0 && (
                <DetailTableRow><DetailTableTd colSpan={8} className="text-center text-muted-foreground py-8">Tidak ada data persediaan</DetailTableTd></DetailTableRow>
              )}
              {rows.length > 0 && (
                <DetailTableRow className="font-bold border-t-2 border-default">
                  <DetailTableTd colSpan={5}>TOTAL</DetailTableTd>
                  <DetailTableTd align="right">{totalQty.toLocaleString('id-ID')}</DetailTableTd>
                  <DetailTableTd align="right">-</DetailTableTd>
                  <DetailTableTd align="right" className="text-primary">{formatCurrency(totalValue)}</DetailTableTd>
                </DetailTableRow>
              )}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>
    </div>
  )
}
