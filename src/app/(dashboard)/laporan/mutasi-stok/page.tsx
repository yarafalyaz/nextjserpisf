export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
import { ArrowLeftRight } from 'lucide-react'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { PrintHeader } from "@/components/reports/print-header"
import { Select, ListBox, Label, Button } from "@heroui/react"
import { AppDatePicker } from "@/components/ui/date-picker"

export default async function StockMovementPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouseId?: string; startDate?: string; endDate?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams

  const now = new Date()
  const startDate = params.startDate ? new Date(params.startDate) : new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = params.endDate ? new Date(params.endDate) : now
  const warehouseId = params.warehouseId ? parseInt(params.warehouseId) : null

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: 'asc' },
  })

  const moves = await prisma.stockMove.findMany({
    where: {
      status: 'posted',
      date: { gte: startDate, lte: endDate },
      ...(warehouseId ? { warehouseId } : {}),
    },
    include: {
      item: { select: { sku: true, name: true, unitOfMeasure: true } },
      warehouse: { select: { code: true, name: true } },
    },
    orderBy: { date: 'asc' },
  })

  const rows = moves.map(m => ({
    date: m.date,
    documentNo: m.documentNo,
    sku: m.item.sku,
    itemName: m.item.name,
    uom: m.item.unitOfMeasure,
    warehouse: m.warehouse ? `${m.warehouse.code}` : '-',
    type: m.moveType || '-',
    impact: m.impact,
    qty: Number(m.qty),
    cost: Number(m.cost),
    value: Number(m.qty) * Number(m.cost),
    reference: m.referenceType ? `${m.referenceType}#${m.referenceId}` : '-',
    description: m.description || '-',
  }))

  const totalIn = rows.filter(r => r.impact === 'IN').reduce((s, r) => s + r.qty, 0)
  const totalOut = rows.filter(r => r.impact === 'OUT').reduce((s, r) => s + r.qty, 0)
  const totalValueIn = rows.filter(r => r.impact === 'IN').reduce((s, r) => s + r.value, 0)
  const totalValueOut = rows.filter(r => r.impact === 'OUT').reduce((s, r) => s + r.value, 0)
  const period = `${startDate.toLocaleDateString('id-ID')} - ${endDate.toLocaleDateString('id-ID')}`

  return (
    <div className="flex flex-col gap-6">
      <PrintHeader title="Laporan Mutasi Stok" period={period} />
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Reports", href: "/reports" },
        { label: "Stock Movement" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={24} />
          <h1>Laporan Mutasi Stok</h1>
        </div>
        <ExportButtons title="Stock_Movement" />
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
        <AppDatePicker label="Dari" name="startDate" defaultValue={params.startDate || startDate.toISOString().split('T')[0]} className="w-[180px]" />
        <AppDatePicker label="Sampai" name="endDate" defaultValue={params.endDate || endDate.toISOString().split('T')[0]} className="w-[180px]" />
        <Button type="submit" variant="primary" size="sm">Generate</Button>
      </form>

      {/* KPI */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6">
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Total Transaksi</div>
          <div className="text-xl font-bold">{rows.length}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Qty Masuk</div>
          <div className="text-xl font-bold text-success">{totalIn.toLocaleString('id-ID')}</div>
          <div className="text-xs text-muted">{formatCurrency(totalValueIn)}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Qty Keluar</div>
          <div className="text-xl font-bold text-danger">{totalOut.toLocaleString('id-ID')}</div>
          <div className="text-xs text-muted">{formatCurrency(totalValueOut)}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted font-medium">Net Movement</div>
          <div className={`text-xl font-bold ${totalIn - totalOut >= 0 ? 'text-success' : 'text-danger'}`}>{(totalIn - totalOut).toLocaleString('id-ID')}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Detail Mutasi</h2>
          <span className="text-sm text-muted">{rows.length} transaksi</span>
        </div>
        <div className="p-4 px-5 overflow-x-auto">
          <DetailTable data-report-table="Stock Movement">
            <DetailTableHead>
              <DetailTableTh>Tanggal</DetailTableTh>
              <DetailTableTh>No. Dokumen</DetailTableTh>
              <DetailTableTh>SKU</DetailTableTh>
              <DetailTableTh>Item</DetailTableTh>
              <DetailTableTh>Gudang</DetailTableTh>
              <DetailTableTh>Tipe</DetailTableTh>
              <DetailTableTh align="right">Masuk</DetailTableTh>
              <DetailTableTh align="right">Keluar</DetailTableTh>
              <DetailTableTh align="right">Nilai</DetailTableTh>
              <DetailTableTh>Referensi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((row, i) => (
                <DetailTableRow key={i}>
                  <DetailTableTd>{row.date?.toLocaleDateString('id-ID') || '-'}</DetailTableTd>
                  <DetailTableTd className="font-mono text-sm">{row.documentNo}</DetailTableTd>
                  <DetailTableTd className="font-mono text-sm">{row.sku}</DetailTableTd>
                  <DetailTableTd>{row.itemName}</DetailTableTd>
                  <DetailTableTd>{row.warehouse}</DetailTableTd>
                  <DetailTableTd>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.impact === 'IN' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                      {row.impact}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd align="right" className="text-success">{row.impact === 'IN' ? row.qty.toLocaleString('id-ID') : '-'}</DetailTableTd>
                  <DetailTableTd align="right" className="text-danger">{row.impact === 'OUT' ? row.qty.toLocaleString('id-ID') : '-'}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(row.value)}</DetailTableTd>
                  <DetailTableTd className="text-sm text-muted">{row.reference}</DetailTableTd>
                </DetailTableRow>
              ))}
              {rows.length === 0 && (
                <DetailTableRow><DetailTableTd colSpan={10} className="text-center text-muted py-8">Tidak ada mutasi dalam periode ini</DetailTableTd></DetailTableRow>
              )}
              {rows.length > 0 && (
                <DetailTableRow className="font-bold border-t-2 border-default">
                  <DetailTableTd colSpan={6}>TOTAL</DetailTableTd>
                  <DetailTableTd align="right" className="text-success">{totalIn.toLocaleString('id-ID')}</DetailTableTd>
                  <DetailTableTd align="right" className="text-danger">{totalOut.toLocaleString('id-ID')}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(totalValueIn + totalValueOut)}</DetailTableTd>
                  <DetailTableTd>{""}</DetailTableTd>
                </DetailTableRow>
              )}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>
    </div>
  )
}
