export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportLetterhead } from "@/components/reports/report-letterhead"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ringkasan Stok" }

export default async function InventorySummaryPage() {
  await requirePermission('view_reports')

  const [warehouses, items, layers] = await Promise.all([
    prisma.warehouse.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { code: 'asc' },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null, qtyOnHand: { gt: 0 } },
      include: {
        category: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.inventoryLayer.findMany({
      where: { remaining: { gt: 0 } },
      select: { itemId: true, warehouseId: true, remaining: true, unitCost: true },
    }),
  ])

  // Per-warehouse aggregation. Derive qty, value AND item count from the FIFO
  // layers using the layer's own warehouseId — the canonical physical location,
  // identical to the valuasi-stok report. Computing every column from one
  // source guarantees the qty/value columns foot exactly (Σ rows === TOTAL) and
  // stay consistent with the inventory valuation report. The previous version
  // mixed axes (value by stockMove.warehouseId, qty/count by
  // item.defaultWarehouseId), so rows could show qty without value and items
  // lacking a default warehouse silently dropped out of the rows while still
  // inflating the total.
  type WhAgg = { qty: number; value: number; items: Set<number> }
  const byWarehouse = new Map<number, WhAgg>() // key 0 = no/unknown warehouse
  for (const layer of layers) {
    const whId = layer.warehouseId ?? 0
    const agg = byWarehouse.get(whId) || { qty: 0, value: 0, items: new Set<number>() }
    const remaining = Number(layer.remaining)
    agg.qty += remaining
    agg.value += remaining * Number(layer.unitCost)
    agg.items.add(layer.itemId)
    byWarehouse.set(whId, agg)
  }

  // Rows for active warehouses, plus a catch-all for layers whose warehouse is
  // null or no longer active, so no stock is dropped from the footing.
  const warehouseRows = warehouses.map(wh => {
    const agg = byWarehouse.get(wh.id)
    return {
      code: wh.code,
      name: wh.name,
      items: agg?.items.size || 0,
      qty: agg?.qty || 0,
      value: agg?.value || 0,
    }
  })
  const listedIds = new Set(warehouses.map(w => w.id))
  const orphan: WhAgg = { qty: 0, value: 0, items: new Set<number>() }
  for (const [whId, agg] of byWarehouse) {
    if (listedIds.has(whId)) continue
    orphan.qty += agg.qty
    orphan.value += agg.value
    for (const id of agg.items) orphan.items.add(id)
  }
  if (orphan.qty > 0 || orphan.value > 0) {
    warehouseRows.push({ code: '-', name: 'Tanpa Gudang / Lainnya', items: orphan.items.size, qty: orphan.qty, value: orphan.value })
  }

  // Totals reconcile to the same FIFO layers as the rows above. qty and value
  // foot exactly; item count is distinct SKUs in stock (a SKU stocked in two
  // warehouses counts once here but appears in both warehouse rows).
  const distinctItems = new Set<number>()
  let totalQty = 0
  let totalValue = 0
  for (const layer of layers) {
    distinctItems.add(layer.itemId)
    const remaining = Number(layer.remaining)
    totalQty += remaining
    totalValue += remaining * Number(layer.unitCost)
  }
  const totalItems = distinctItems.size

  // Low stock items
  const lowStockItems = await prisma.item.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      minStock: { gt: 0 },
    },
    include: { category: { select: { name: true } }, warehouse: { select: { code: true } } },
    orderBy: { name: 'asc' },
  })
  const criticalItems = lowStockItems.filter(i => Number(i.qtyOnHand) <= Number(i.minStock))

  // Category breakdown
  const byCategory = new Map<string, { count: number; qty: number; value: number }>()
  for (const item of items) {
    const cat = item.category?.name || 'Tanpa Kategori'
    const existing = byCategory.get(cat) || { count: 0, qty: 0, value: 0 }
    existing.count++
    existing.qty += Number(item.qtyOnHand)
    // Approximate value using item.cost * qty
    existing.value += Number(item.qtyOnHand) * Number(item.cost)
    byCategory.set(cat, existing)
  }
  const categoryRows = Array.from(byCategory.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.value - a.value)

  const periodLabel = `Per ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Ringkasan Persediaan" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Inventory_Summary" />
      </div>

      {/* Professional letterhead (screen + print) */}
      <ReportLetterhead title="Ringkasan Persediaan" subtitle="Inventory Summary" periodLabel={periodLabel} />

      {/* KPI (screen only) */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6 print:hidden">
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Total Jenis Item</div>
          <div className="text-xl font-bold">{totalItems}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Total Qty</div>
          <div className="text-xl font-bold">{totalQty.toLocaleString('id-ID')}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Total Nilai</div>
          <div className="text-xl font-bold text-primary">{formatCurrency(totalValue)}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Item Kritis (Stok Rendah)</div>
          <div className={`text-xl font-bold ${criticalItems.length > 0 ? 'text-danger' : 'text-success'}`}>{criticalItems.length}</div>
        </div>
      </div>

      {/* Per Warehouse */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6 no-break">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">PERSEDIAAN PER GUDANG</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable data-report-table="Per Gudang">
            <DetailTableHead>
              <DetailTableTh>Kode</DetailTableTh>
              <DetailTableTh>Nama Gudang</DetailTableTh>
              <DetailTableTh align="right">Jenis Item</DetailTableTh>
              <DetailTableTh align="right">Total Qty</DetailTableTh>
              <DetailTableTh align="right">Total Nilai</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {warehouseRows.map((row) => (
                <DetailTableRow key={row.code}>
                  <DetailTableTd className="font-mono">{row.code}</DetailTableTd>
                  <DetailTableTd className="font-medium">{row.name}</DetailTableTd>
                  <DetailTableTd align="right">{row.items}</DetailTableTd>
                  <DetailTableTd align="right">{row.qty.toLocaleString('id-ID')}</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatAccounting(row.value)}</DetailTableTd>
                </DetailTableRow>
              ))}
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={2}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{totalItems}</DetailTableTd>
                <DetailTableTd align="right">{totalQty.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right" className="text-primary">{formatAccounting(totalValue)}</DetailTableTd>
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Per Category */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6 no-break">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">PERSEDIAAN PER KATEGORI</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable data-report-table="Per Kategori">
            <DetailTableHead>
              <DetailTableTh>Kategori</DetailTableTh>
              <DetailTableTh align="right">Jenis Item</DetailTableTh>
              <DetailTableTh align="right">Total Qty</DetailTableTh>
              <DetailTableTh align="right">Estimasi Nilai</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {categoryRows.map((row) => (
                <DetailTableRow key={row.name}>
                  <DetailTableTd className="font-medium">{row.name}</DetailTableTd>
                  <DetailTableTd align="right">{row.count}</DetailTableTd>
                  <DetailTableTd align="right">{row.qty.toLocaleString('id-ID')}</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatAccounting(row.value)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Critical Items */}
      {criticalItems.length > 0 && (
        <div className="bg-surface rounded-xl border border-danger/30 shadow-sm overflow-hidden no-break">
          <div className="flex items-center justify-between p-4 px-5 border-b border-danger/30 bg-danger/5">
            <h2 className="text-[0.9375rem] font-semibold text-danger">ITEM KRITIS (Stok ≤ Minimum)</h2>
          </div>
          <div className="p-4 px-5">
            <DetailTable data-report-table="Item Kritis">
              <DetailTableHead>
                <DetailTableTh>SKU</DetailTableTh>
                <DetailTableTh>Nama Item</DetailTableTh>
                <DetailTableTh>Kategori</DetailTableTh>
                <DetailTableTh>Gudang</DetailTableTh>
                <DetailTableTh align="right">Stok</DetailTableTh>
                <DetailTableTh align="right">Min. Stok</DetailTableTh>
                <DetailTableTh align="right">Kekurangan</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {criticalItems.map((item) => {
                  const shortage = Number(item.minStock) - Number(item.qtyOnHand)
                  return (
                    <DetailTableRow key={item.id}>
                      <DetailTableTd className="font-mono text-sm">{item.sku}</DetailTableTd>
                      <DetailTableTd className="font-medium">{item.name}</DetailTableTd>
                      <DetailTableTd>{item.category?.name || '-'}</DetailTableTd>
                      <DetailTableTd>{item.warehouse?.code || '-'}</DetailTableTd>
                      <DetailTableTd align="right" className="text-danger font-semibold">{Number(item.qtyOnHand).toLocaleString('id-ID')}</DetailTableTd>
                      <DetailTableTd align="right">{Number(item.minStock).toLocaleString('id-ID')}</DetailTableTd>
                      <DetailTableTd align="right" className="text-danger font-bold">{shortage > 0 ? shortage.toLocaleString('id-ID') : '-'}</DetailTableTd>
                    </DetailTableRow>
                  )
                })}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      )}
    </div>
  )
}
