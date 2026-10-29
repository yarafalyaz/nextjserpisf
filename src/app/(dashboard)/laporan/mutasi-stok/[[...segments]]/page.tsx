export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency, formatDate, formatNumber, formatReferenceType, referenceHref } from '@/lib/utils/format'
import { resolveReferenceSlugs, referenceSlugKey } from '@/lib/services/reference-slug.service'
import Link from 'next/link'
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { aggregateStockMovementTotals } from "@/lib/reports/stock-flow-data"
import { reportPeriodFromRoute, splitReportSegments } from "@/lib/reports/report-period"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { ReportLetterhead } from "@/components/reports/report-letterhead"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Mutasi Stok" }

export default async function StockMovementPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ warehouseId?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period

  // Gudang dari path (slug lebih dulu, id sebagai cadangan); `?warehouseId=` lama
  // tetap dibaca supaya tautan sebelum perpindahan tidak jadi tautan mati.
  const warehouseKey = splitReportSegments(segments).filters.gudang ?? search.warehouseId ?? null

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, slug: true },
  })

  const warehouseRow = warehouseKey
    ? warehouses.find((w) => w.slug === warehouseKey) ?? warehouses.find((w) => String(w.id) === warehouseKey) ?? null
    : null
  const warehouseId = warehouseRow?.id ?? null

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

  // AC-INV-009: slug kanonis dokumen sumber untuk tautan referensi.
  const referenceSlugs = await resolveReferenceSlugs(moves)

  const rows = moves
    .map(m => {
      if (!m.date) return null
      return {
        date: m.date, documentNo: m.documentNo, sku: m.item.sku, itemName: m.item.name,
        uom: m.item.unitOfMeasure, warehouse: m.warehouse ? `${m.warehouse.code}` : '-',
        type: m.moveType || '-', impact: m.impact, qty: Number(m.qty), cost: Number(m.cost),
        reference: m.referenceType ? `${formatReferenceType(m.referenceType)}#${m.referenceId}` : '-',
        referenceHref: referenceHref(m.referenceType, m.referenceId, referenceSlugs.get(referenceSlugKey(m))),
        description: m.description || '-',
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const totals = aggregateStockMovementTotals(rows.map((r) => ({ impact: r.impact, qty: r.qty, cost: r.cost })))
  const totalIn = totals.totalInQty
  const totalOut = totals.totalOutQty
  const totalValueIn = totals.totalInValue
  const totalValueOut = totals.totalOutValue
  const periodLabel = `Periode ${formatDate(startDate)} – ${formatDate(endDate)}`

  return (
    <ReportPageShell title="Mutasi Stok" sheet={false} wide filter={<>
<ReportPeriodFilter
        basePath="/laporan/mutasi-stok"
        mode="range"
        defaultStartDate={toLocalDateOnly(startDate)}
        defaultEndDate={toLocalDateOnly(endDate)}
        selects={[
          {
            param: "gudang",
            label: "Gudang",
            placeholder: "Cari gudang (kode / nama)...",
            value: warehouseKey ?? "",
            options: warehouses.map((w) => ({ value: w.slug ?? String(w.id), label: `${w.code} - ${w.name}` })),
          },
        ]}
      />
</>} actions={<>
<div className="flex items-center justify-end print:hidden"><ExportButtons title="Mutasi_Stok" pdfHref={buildReportPdfHref("mutasi-stok", period.slug, warehouseRow ? { gudang: warehouseRow.slug ?? String(warehouseRow.id) } : {})} /></div>
</>}>



      <ReportLetterhead title="Mutasi Stok" subtitle="Pergerakan Stok" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Mutasi Stok mencatat seluruh pergerakan persediaan barang selama periode tertentu, termasuk penerimaan, pengeluaran, dan penyesuaian. Laporan ini berguna untuk memantau perputaran stok dan mengidentifikasi potensi kelebihan atau kekurangan persediaan." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Masuk (Qty)" value={formatNumber(totalIn)} valueClassName="text-success" />
        <ReportKpiCard label="Total Keluar (Qty)" value={formatNumber(totalOut)} valueClassName="text-danger" />
        <ReportKpiCard label="Nilai Masuk" value={formatCurrency(totalValueIn)} valueClassName="text-success" />
        <ReportKpiCard label="Nilai Keluar" value={formatCurrency(totalValueOut)} valueClassName="text-danger" />
      </div>
      <ReportSection title="Mutasi Stok">
        <DetailTable data-report-table="Mutasi Stok">
          <DetailTableHead>
            <DetailTableTh>Tanggal</DetailTableTh><DetailTableTh>Dokumen</DetailTableTh><DetailTableTh>SKU</DetailTableTh>
            <DetailTableTh>Nama Item</DetailTableTh><DetailTableTh>Gudang</DetailTableTh><DetailTableTh>Jenis</DetailTableTh>
            <DetailTableTh align="right">Qty</DetailTableTh><DetailTableTh>Referensi</DetailTableTh><DetailTableTh>Keterangan</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((r, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd>{formatDate(r.date, { format: "numeric" })}</DetailTableTd>
                <DetailTableTd className="font-mono text-xs">{r.documentNo}</DetailTableTd>
                <DetailTableTd className="font-mono text-xs">{r.sku}</DetailTableTd>
                <DetailTableTd className="font-medium">{r.itemName}</DetailTableTd>
                <DetailTableTd>{r.warehouse}</DetailTableTd>
                <DetailTableTd>{{ production_issue: "Pengeluaran Produksi", production_receipt: "Penerimaan Produksi" }[r.type] ?? r.type}</DetailTableTd>
                <DetailTableTd align="right" className={r.impact === 'OUT' ? 'text-danger font-semibold' : 'text-success font-semibold'}>
                  {r.impact === 'OUT' ? '-' : '+'}{formatNumber(r.qty)}
                </DetailTableTd>
                <DetailTableTd className="text-xs">{r.referenceHref ? <Link href={r.referenceHref} className="text-primary hover:underline">{r.reference}</Link> : r.reference}</DetailTableTd>
                <DetailTableTd className="text-xs max-w-[200px] truncate">{r.description}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={9} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada mutasi stok" className="py-0" /></DetailTableTd></DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}
