export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { Package } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { PrintHeader } from "@/components/reports/print-header"
import { Select, ListBox, Label, Button } from "@heroui/react"

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

  // Get inventory layers grouped by item + warehouse (via stockMove)
  const layers = await prisma.inventoryLayer.findMany({
    where: {
      remaining: { gt: 0 },
      ...(warehouseId ? { stockMove: { warehouseId } } : {}),
    },
    include: {
      item: { select: { id: true, sku: true, name: true, unitOfMeasure: true, category: { select: { name: true } } } },
      stockMove: { select: { warehouseId: true, warehouse: { select: { name: true, code: true } } } },
    },
  })

  // Aggregate: item + warehouse → qty, value
  const aggregated = new Map<string, { sku: string; name: string; uom: string; category: string; warehouse: string; warehouseCode: string; qty: number; value: number }>()

  for (const layer of layers) {
    const key = `${layer.itemId}-${layer.stockMove.warehouseId || 0}`
    const existing = aggregated.get(key) || {
      sku: layer.item.sku,
      name: layer.item.name,
      uom: layer.item.unitOfMeasure,
      category: layer.item.category?.name || '-',
      warehouse: layer.stockMove.warehouse?.name || '-',
      warehouseCode: layer.stockMove.warehouse?.code || '-',
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
      <PrintHeader title="Stock Valuation per Gudang" period={period} />
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Reports", href: "/laporan" },
        { label: "Stock Valuation" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Package size={24} />
          <h1>Stock Valuation per Gudang</h1>
        </div>
        <ExportButtons title="Stock_Valuation" />
      </div>

      <form className="mb-6 flex items-center gap-4 flex-wrap print:hidden">
        <Select name="warehouseId" defaultSelectedKey={params.warehouseId || ""} placeholder="Semua Gudang" className="w-[220px]">
          <Label>Gudang</Label>
          <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="" textValue="Semua Gudang">Semua Gudang<ListBox.ItemIndicator /></ListBox.Item>
              {warehouses.map(w => (
                <ListBox.Item key={String(w.id)} id={String(w.id)} textValue={`${w.code} - ${w.name}`}>{w.code} - {w.name}<ListBox.ItemIndicator /></ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Button type="submit" variant="primary" size="sm">Filter</Button>
      </form>

      {/* KPI */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6">
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Total Item</div>
          <div className="text-xl font-bold">{rows.length}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Total Qty</div>
          <div className="text-xl font-bold">{totalQty.toLocaleString('id-ID')}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Total Nilai Persediaan</div>
          <div className="text-xl font-bold text-primary">{formatCurrency(totalValue)}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Gudang Aktif</div>
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
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Detail Stock Valuation</h2>
          <span className="text-sm text-muted">{rows.length} baris</span>
        </div>
        <div className="p-4 px-5 overflow-x-auto">
          <DetailTable data-report-table="Stock Valuation">
            <DetailTableHead>
              <DetailTableTh>SKU</DetailTableTh>
              <DetailTableTh>Nama Item</DetailTableTh>
              <DetailTableTh>Kategori</DetailTableTh>
              <DetailTableTh>Gudang</DetailTableTh>
              <DetailTableTh>UoM</DetailTableTh>
              <DetailTableTh align="right">Qty</DetailTableTh>
              <DetailTableTh align="right">Avg Cost</DetailTableTh>
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
                <DetailTableRow><DetailTableTd colSpan={8} className="text-center text-muted py-8">Tidak ada data persediaan</DetailTableTd></DetailTableRow>
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
