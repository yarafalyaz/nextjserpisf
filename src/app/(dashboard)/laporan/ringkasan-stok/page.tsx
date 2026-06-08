export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { BarChart3 } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { PrintHeader } from "@/components/reports/print-header"

export default async function InventorySummaryPage() {
  await requirePermission('view_reports')

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: 'asc' },
  })

  // Get all items with stock
  const items = await prisma.item.findMany({
    where: { isActive: true, deletedAt: null, qtyOnHand: { gt: 0 } },
    include: {
      category: { select: { name: true } },
      warehouse: { select: { id: true, code: true, name: true } },
    },
    orderBy: { name: 'asc' },
  })

  // Get inventory layers for value calculation
  const layers = await prisma.inventoryLayer.findMany({
    where: { remaining: { gt: 0 } },
    include: {
      stockMove: { select: { warehouseId: true } },
    },
  })

  // Aggregate value per warehouse
  const valueByWarehouse = new Map<number, number>()
  for (const layer of layers) {
    const whId = layer.stockMove.warehouseId || 0
    const value = Number(layer.remaining) * Number(layer.unitCost)
    valueByWarehouse.set(whId, (valueByWarehouse.get(whId) || 0) + value)
  }

  // Aggregate items per warehouse
  const itemsByWarehouse = new Map<number, { count: number; totalQty: number }>()
  for (const item of items) {
    const whId = item.defaultWarehouseId || 0
    const existing = itemsByWarehouse.get(whId) || { count: 0, totalQty: 0 }
    existing.count++
    existing.totalQty += Number(item.qtyOnHand)
    itemsByWarehouse.set(whId, existing)
  }

  // Build warehouse summary
  const warehouseRows = warehouses.map(wh => ({
    code: wh.code,
    name: wh.name,
    items: itemsByWarehouse.get(wh.id)?.count || 0,
    qty: itemsByWarehouse.get(wh.id)?.totalQty || 0,
    value: valueByWarehouse.get(wh.id) || 0,
  }))

  const totalItems = items.length
  const totalQty = items.reduce((s, i) => s + Number(i.qtyOnHand), 0)
  const totalValue = Array.from(valueByWarehouse.values()).reduce((s, v) => s + v, 0)

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

  const period = `Per ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <PrintHeader title="Ringkasan Persediaan" period={period} />
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Laporan", href: "/laporan" },
        { label: "Ringkasan Persediaan" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={24} />
          <h1>Ringkasan Persediaan</h1>
        </div>
        <ExportButtons title="Inventory_Summary" />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6">
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
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
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
                  <DetailTableTd align="right" className="font-semibold">{formatCurrency(row.value)}</DetailTableTd>
                </DetailTableRow>
              ))}
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={2}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{totalItems}</DetailTableTd>
                <DetailTableTd align="right">{totalQty.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right" className="text-primary">{formatCurrency(totalValue)}</DetailTableTd>
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Per Category */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6">
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
                  <DetailTableTd align="right" className="font-semibold">{formatCurrency(row.value)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Critical Items */}
      {criticalItems.length > 0 && (
        <div className="bg-surface rounded-xl border border-danger/30 shadow-sm overflow-hidden">
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
