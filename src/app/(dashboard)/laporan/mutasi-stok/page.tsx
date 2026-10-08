export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatReferenceType } from '@/lib/utils/format'
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
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
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  })

  const rows = moves
    .map(m => {
      if (!m.date) return null
      return {
        date: m.date, documentNo: m.documentNo, sku: m.item.sku, itemName: m.item.name,
        uom: m.item.unitOfMeasure, warehouse: m.warehouse ? `${m.warehouse.code}` : '-',
        type: m.moveType || '-', impact: m.impact, qty: Number(m.qty), cost: Number(m.cost),
        value: Number(m.qty) * Number(m.cost),
        reference: m.referenceType ? `${formatReferenceType(m.referenceType)}#${m.referenceId}` : '-', description: m.description || '-',
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const totalIn = rows.filter(r => r.impact === 'IN').reduce((s, r) => s + r.qty, 0)
  const totalOut = rows.filter(r => r.impact === 'OUT').reduce((s, r) => s + r.qty, 0)
  const totalValueIn = rows.filter(r => r.impact === 'IN').reduce((s, r) => s + r.value, 0)
  const totalValueOut = rows.filter(r => r.impact === 'OUT').reduce((s, r) => s + r.value, 0)
  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Laporan", href: "/laporan" }, { label: "Mutasi Stok" }]} />
      </div>
      <div className="flex items-center justify-end print:hidden"><ExportButtons title="Mutasi_Stok" /></div>
      <form className="mb-2 flex items-center gap-4 flex-wrap print:hidden">
        <div className="flex flex-col gap-1.5 w-[220px]">
          <Label htmlFor="warehouseId">Gudang</Label>
          <FormSelect id="warehouseId" name="warehouseId" defaultValue={params.warehouseId || undefined}
            placeholder="Semua Gudang" options={warehouses.map(w => ({ value: String(w.id), label: `${w.code} - ${w.name}` }))} />
        </div>
        <AppDatePicker label="Dari" name="tanggalMulai" defaultValue={params.tanggalMulai || toLocalDateOnly(startDate)} className="w-[180px]" />
        <AppDatePicker label="Sampai" name="tanggalSelesai" defaultValue={params.tanggalSelesai || toLocalDateOnly(endDate)} className="w-[180px]" />
        <Button type="submit" variant="primary" size="sm">Filter</Button>
      </form>
      <ReportLetterhead title="Mutasi Stok" subtitle="Stock Movement" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Mutasi Stok mencatat seluruh pergerakan persediaan barang selama periode tertentu, termasuk penerimaan, pengeluaran, dan penyesuaian. Laporan ini berguna untuk memantau perputaran stok dan mengidentifikasi potensi kelebihan atau kekurangan persediaan." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Masuk (Qty)" value={totalIn.toLocaleString('id-ID')} valueClassName="text-success" />
        <ReportKpiCard label="Total Keluar (Qty)" value={totalOut.toLocaleString('id-ID')} valueClassName="text-danger" />
        <ReportKpiCard label="Nilai Masuk" value={formatCurrency(totalValueIn)} valueClassName="text-success" />
        <ReportKpiCard label="Nilai Keluar" value={formatCurrency(totalValueOut)} valueClassName="text-danger" />
      </div>
      <ReportSection title="Mutasi Stok">
        <DetailTable data-report-table="Mutasi Stok">
          <DetailTableHead>
            <DetailTableTh>Tanggal</DetailTableTh><DetailTableTh>Dokumen</DetailTableTh><DetailTableTh>SKU</DetailTableTh>
            <DetailTableTh>Nama Item</DetailTableTh><DetailTableTh>Gudang</DetailTableTh><DetailTableTh>Jenis</DetailTableTh>
            <DetailTableTh align="right">Qty</DetailTableTh><DetailTableTh>Ref</DetailTableTh><DetailTableTh>Keterangan</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((r, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd>{r.date.toLocaleDateString('id-ID')}</DetailTableTd>
                <DetailTableTd className="font-mono text-xs">{r.documentNo}</DetailTableTd>
                <DetailTableTd className="font-mono text-xs">{r.sku}</DetailTableTd>
                <DetailTableTd className="font-medium">{r.itemName}</DetailTableTd>
                <DetailTableTd>{r.warehouse}</DetailTableTd>
                <DetailTableTd>{r.type}</DetailTableTd>
                <DetailTableTd align="right" className={r.impact === 'IN' ? 'text-success font-semibold' : 'text-danger font-semibold'}>
                  {r.impact === 'IN' ? '+' : '-'}{r.qty.toLocaleString('id-ID')}
                </DetailTableTd>
                <DetailTableTd className="text-xs">{r.reference}</DetailTableTd>
                <DetailTableTd className="text-xs max-w-[200px] truncate">{r.description}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={9} className="text-center text-muted-foreground py-6">Tidak ada mutasi stok</DetailTableTd></DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </div>
  )
}
