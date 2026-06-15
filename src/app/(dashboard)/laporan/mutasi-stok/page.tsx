export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatAccounting } from '@/lib/utils/format'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"
import { AppDatePicker } from "@/components/ui/date-picker"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Mutasi Stok" }

export default async function StockMovementPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouseId?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams

  const now = new Date()
  const startDate = params.tanggalMulai ? new Date(params.tanggalMulai) : new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = params.tanggalSelesai ? new Date(params.tanggalSelesai) : now
  endDate.setHours(23, 59, 59, 999)
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
    // Stable secondary sort so same-day rows render in a consistent order across
    // refreshes (this report has no running balance, so totals are unaffected;
    // this is display determinism only, matching buku-besar/buku-bank).
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
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
  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Mutasi Stok" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Mutasi_Stok" />
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
        <AppDatePicker label="Dari" name="tanggalMulai" defaultValue={params.tanggalMulai || startDate.toISOString().split('T')[0]} className="w-[180px]" />
        <AppDatePicker label="Sampai" name="tanggalSelesai" defaultValue={params.tanggalSelesai || endDate.toISOString().split('T')[0]} className="w-[180px]" />
        <Button type="submit" variant="primary" size="sm">Tampilkan</Button>
      </form>

      {/* Professional letterhead (screen + print) */}
      <ReportLetterhead title="Laporan Mutasi Stok" subtitle="Stock Movement" periodLabel={periodLabel} />

      {/* KPI (screen only) */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6 print:hidden">
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Total Transaksi</div>
          <div className="text-xl font-bold">{rows.length}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Qty Masuk</div>
          <div className="text-xl font-bold text-success">{totalIn.toLocaleString('id-ID')}</div>
          <div className="text-xs text-muted-foreground">{formatCurrency(totalValueIn)}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Qty Keluar</div>
          <div className="text-xl font-bold text-danger">{totalOut.toLocaleString('id-ID')}</div>
          <div className="text-xs text-muted-foreground">{formatCurrency(totalValueOut)}</div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex flex-col gap-1 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-[0.8125rem] text-muted-foreground font-medium">Mutasi Bersih</div>
          <div className={`text-xl font-bold ${totalIn - totalOut >= 0 ? 'text-success' : 'text-danger'}`}>{(totalIn - totalOut).toLocaleString('id-ID')}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden no-break">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Detail Mutasi</h2>
          <span className="text-sm text-muted-foreground">{rows.length} transaksi</span>
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
                  <DetailTableTd align="right">{formatAccounting(row.value)}</DetailTableTd>
                  <DetailTableTd className="text-sm text-muted-foreground">{row.reference}</DetailTableTd>
                </DetailTableRow>
              ))}
              {rows.length === 0 && (
                <DetailTableRow><DetailTableTd colSpan={10} className="text-center text-muted-foreground py-8">Tidak ada mutasi dalam periode ini</DetailTableTd></DetailTableRow>
              )}
              {rows.length > 0 && (
                <DetailTableRow className="font-bold border-t-2 border-default">
                  <DetailTableTd colSpan={6}>TOTAL</DetailTableTd>
                  <DetailTableTd align="right" className="text-success">{totalIn.toLocaleString('id-ID')}</DetailTableTd>
                  <DetailTableTd align="right" className="text-danger">{totalOut.toLocaleString('id-ID')}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(totalValueIn + totalValueOut)}</DetailTableTd>
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
