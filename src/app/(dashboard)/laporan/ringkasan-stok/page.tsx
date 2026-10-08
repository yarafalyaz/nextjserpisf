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
      include: { category: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.inventoryLayer.findMany({
      where: { remaining: { gt: 0 } },
      select: { itemId: true, warehouseId: true, remaining: true, unitCost: true },
    }),
  ])

  type WhAgg = { qty: number; value: number; items: Set<number> }
  const byWarehouse = new Map<number, WhAgg>()
  for (const layer of layers) {
    const whId = layer.warehouseId ?? 0
    const agg = byWarehouse.get(whId) || { qty: 0, value: 0, items: new Set<number>() }
    const remaining = Number(layer.remaining)
    agg.qty += remaining
    agg.value += remaining * Number(layer.unitCost)
    agg.items.add(layer.itemId)
    byWarehouse.set(whId, agg)
  }

  const warehouseRows = warehouses.map(wh => {
    const agg = byWarehouse.get(wh.id)
    return { code: wh.code, name: wh.name, items: agg?.items.size || 0, qty: agg?.qty || 0, value: agg?.value || 0 }
  })
  const listedIds = new Set(warehouses.map(w => w.id))
  const orphan: WhAgg = { qty: 0, value: 0, items: new Set<number>() }
  for (const [whId, agg] of byWarehouse) {
    if (listedIds.has(whId)) continue
    orphan.qty += agg.qty; orphan.value += agg.value; for (const id of agg.items) orphan.items.add(id)
  }
  if (orphan.qty > 0 || orphan.value > 0) {
    warehouseRows.push({ code: '-', name: 'Tanpa Gudang / Lainnya', items: orphan.items.size, qty: orphan.qty, value: orphan.value })
  }

  const distinctItems = new Set<number>()
  let totalQty = 0, totalValue = 0
  for (const layer of layers) {
    distinctItems.add(layer.itemId)
    const remaining = Number(layer.remaining)
    totalQty += remaining
    totalValue += remaining * Number(layer.unitCost)
  }
  const totalItems = distinctItems.size

  const lowStockItems = await prisma.item.findMany({
    where: { isActive: true, deletedAt: null, minStock: { gt: 0 } },
    include: { category: { select: { name: true } }, warehouse: { select: { code: true } } },
    orderBy: { name: 'asc' },
  })
  const criticalItems = lowStockItems.filter(i => Number(i.qtyOnHand) <= Number(i.minStock))

  // Category roll-up MUST use the same valuation basis as the per-warehouse
  // table (FIFO layer cost), otherwise the two tables disagree and neither
  // reconciles with the "Total Nilai" KPI. Previously this used master
  // `item.cost × qtyOnHand` while the warehouse table used layer `unitCost`,
  // so the category "Estimasi Nilai" could never tie out.
  const itemById = new Map(items.map((i) => [i.id, i]))
  const categoryOfItem = new Map<number, string>()
  for (const item of items) {
    categoryOfItem.set(item.id, item.category?.name || 'Tanpa Kategori')
  }
  // Items that still have layers but were excluded from `items` (qtyOnHand <= 0
  // drift) must still be categorised so layers are not silently dropped.
  const missingItemIds = [...new Set(layers.map((l) => l.itemId))].filter((id) => !itemById.has(id))
  const missingItems = missingItemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: missingItemIds } },
        select: { id: true, category: { select: { name: true } } },
      })
    : []
  for (const item of missingItems) {
    categoryOfItem.set(item.id, item.category?.name || 'Tanpa Kategori')
  }

  const byCategory = new Map<string, { count: number; qty: number; value: number; items: Set<number> }>()
  for (const layer of layers) {
    const cat = categoryOfItem.get(layer.itemId) || 'Tanpa Kategori'
    const existing = byCategory.get(cat) || { count: 0, qty: 0, value: 0, items: new Set<number>() }
    const remaining = Number(layer.remaining)
    existing.qty += remaining
    existing.value += remaining * Number(layer.unitCost)
    existing.items.add(layer.itemId)
    byCategory.set(cat, existing)
  }
  const categoryRows = Array.from(byCategory.entries())
    .map(([name, data]) => ({ name, count: data.items.size, qty: data.qty, value: data.value }))
    .sort((a, b) => b.value - a.value)
  const categoryTotalQty = categoryRows.reduce((s, r) => s + r.qty, 0)
  const categoryTotalValue = categoryRows.reduce((s, r) => s + r.value, 0)

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
        <ExportButtons title="Ringkasan_Persediaan" />
      </div>

      <ReportLetterhead title="Ringkasan Persediaan" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Ringkasan Stok menyajikan saldo dan nilai persediaan per gudang atau per kategori barang secara ringkas. Informasi ini memberikan gambaran cepat tentang posisi persediaan perusahaan secara keseluruhan." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Jenis Item" value={totalItems.toLocaleString('id-ID')} />
        <ReportKpiCard label="Total Qty" value={totalQty.toLocaleString('id-ID')} />
        <ReportKpiCard label="Total Nilai" value={formatCurrency(totalValue)} valueClassName="text-primary" />
        <ReportKpiCard label="Item Kritis" value={criticalItems.length.toString()} valueClassName={criticalItems.length > 0 ? 'text-danger' : 'text-success'} />
      </div>

      <ReportSection title="Persediaan per Gudang">
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
      </ReportSection>

      <ReportSection title="Persediaan per Kategori">
        <DetailTable data-report-table="Per Kategori">
          <DetailTableHead>
            <DetailTableTh>Kategori</DetailTableTh>
            <DetailTableTh align="right">Jenis Item</DetailTableTh>
            <DetailTableTh align="right">Total Qty</DetailTableTh>
            <DetailTableTh align="right">Nilai (FIFO)</DetailTableTh>
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
            {categoryRows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={2}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{categoryTotalQty.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right" className="text-primary">{formatAccounting(categoryTotalValue)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      {criticalItems.length > 0 && (
        <ReportSection title="Item Kritis (Stok ≤ Minimum)">
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
        </ReportSection>
      )}
    </div>
  )
}
