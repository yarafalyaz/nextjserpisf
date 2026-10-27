export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatAccounting, formatCurrency } from '@/lib/utils/format'
import { toLocalDateOnly } from '@/lib/utils/date-only'
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { parseReportFilters } from "@/lib/reports/report-href"
import { RECOGNISED_AR_STATUSES } from '@/lib/reports/document-status'
import { SALES_DIMENSIONS, aggregateSales, monthlySales, type SalesDimension, type SalesLine } from '@/lib/reports/sales-analytics'
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from '@/components/ui/detail-table'
import { EmptyState } from '@/components/ui/empty-state'
import { ExportButtons } from '@/components/reports/export-buttons'
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { ReportLetterhead } from '@/components/reports/report-letterhead'
import { ReportSection, ReportKpiCard } from '@/components/reports/report-section'
import { ReportNarration } from '@/components/reports/report-narration'

import type { Metadata } from 'next'
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Analisis Penjualan" }

export default async function SalesAnalyticsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ dimensi?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period

  // Dimensi pengelompokan dari path; `?dimensi=` lama tetap dibaca.
  const dimensionKey = parseReportFilters(segments.slice(1)).dimensi ?? search.dimensi
  const dimension: SalesDimension = (SALES_DIMENSIONS.find((d) => d.value === dimensionKey)?.value ?? 'barang')

  const invoices = await prisma.salesInvoice.findMany({
    where: { status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null, date: { gte: startDate, lte: endDate } },
    select: {
      id: true,
      date: true,
      grandTotal: true,
      customer: { select: { id: true, name: true } },
      items: { select: { itemId: true, description: true, qty: true, total: true } },
    },
  })

  // SalesInvoiceItem carries only `itemId` (no relation), so resolve the items in
  // one extra query to get SKU / name / brand.
  const itemIds = Array.from(new Set(invoices.flatMap((inv) => inv.items.map((i) => i.itemId)).filter((id): id is number => id != null)))
  const items = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, sku: true, name: true, brand: { select: { name: true } } },
      })
    : []
  const itemById = new Map(items.map((item) => [item.id, item]))

  const lines: SalesLine[] = invoices.flatMap((inv) =>
    inv.items.map((it) => {
      const item = it.itemId != null ? itemById.get(it.itemId) : undefined
      return {
        itemKey: it.itemId != null ? String(it.itemId) : null,
        itemLabel: item ? `${item.sku} — ${item.name}` : (it.description ?? '(tanpa barang)'),
        brandName: item?.brand?.name ?? null,
        customerId: inv.customer.id,
        customerName: inv.customer.name,
        qty: Number(it.qty),
        revenue: Number(it.total),
      }
    }),
  )

  const groups = aggregateSales(lines, dimension)

  // The monthly trend deliberately ignores the period filter: a one-month view of
  // a monthly chart is useless, so it always covers the last 12 months to endDate.
  const trendStart = new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1)
  const trendInvoices = await prisma.salesInvoice.findMany({
    where: { status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null, date: { gte: trendStart, lte: endDate } },
    select: { date: true, grandTotal: true },
  })
  const monthly = monthlySales(trendInvoices.map((inv) => ({ date: inv.date, grandTotal: Number(inv.grandTotal) })))

  const totalRevenue = groups.reduce((sum, row) => sum + row.revenue, 0)
  const totalQty = groups.reduce((sum, row) => sum + row.qty, 0)
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.revenue))
  const dimensionLabel = SALES_DIMENSIONS.find((d) => d.value === dimension)?.label ?? 'Per Barang'
  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <ReportPageShell title="Analisis Penjualan" sheet={false} wide actions={<><ExportButtons title="Analisis_Penjualan" pdfHref={buildReportPdfHref("analisis-penjualan", period.slug, { dimensi: dimension })} /></>}>


      <ReportPeriodFilter
        basePath="/laporan/analisis-penjualan"
        mode="range"
        defaultStartDate={toLocalDateOnly(startDate)}
        defaultEndDate={toLocalDateOnly(endDate)}
        selects={[
          {
            param: "dimensi",
            label: "Kelompokkan",
            placeholder: "Pilih pengelompokan...",
            value: dimension,
            options: SALES_DIMENSIONS.map((d) => ({ value: d.value, label: d.label })),
          },
        ]}
      />



      <ReportLetterhead title="Analisis Penjualan" subtitle={dimensionLabel} periodLabel={periodLabel} />
      <ReportNarration text="Laporan Analisis Penjualan merangkum nilai penjualan per barang, pelanggan, atau merek pada periode terpilih, disertai tren penjualan bulanan. Laporan ini dipakai untuk melihat kontribusi tiap produk/pelanggan dan memantau arah penjualan dari bulan ke bulan." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Penjualan" value={formatCurrency(totalRevenue)} />
        <ReportKpiCard label="Jumlah Faktur" value={String(invoices.length)} />
        <ReportKpiCard label="Total Qty" value={formatAccounting(totalQty, { zeroDash: false })} />
      </div>

      <ReportSection title={`Penjualan ${dimensionLabel}`}>
        <DetailTable data-report-table={`Penjualan ${dimensionLabel}`}>
          <DetailTableHead>
            <DetailTableTh>{dimension === "pelanggan" ? "Pelanggan" : dimension === "merek" ? "Merek" : "Barang"}</DetailTableTh>
            <DetailTableTh align="right">Kuantitas</DetailTableTh>
            <DetailTableTh align="right">Nilai Penjualan</DetailTableTh>
            <DetailTableTh align="right">Porsi</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {groups.map((row) => (
              <DetailTableRow key={row.key}>
                <DetailTableTd className="font-medium">{row.label}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.qty, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.revenue, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{totalRevenue > 0 ? `${((row.revenue / totalRevenue) * 100).toFixed(1)}%` : '–'}</DetailTableTd>
              </DetailTableRow>
            ))}
            {groups.length === 0 && (
              <DetailTableRow>
                <DetailTableTd colSpan={4} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada penjualan pada periode ini" className="py-0" /></DetailTableTd>
              </DetailTableRow>
            )}
            {groups.length > 0 && (
              <DetailTableRow className="border-t-2 border-default font-bold">
                <DetailTableTd>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalQty, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalRevenue, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">100%</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Grafik Penjualan Bulanan" description="12 bulan terakhir sampai akhir periode">
        <DetailTable data-report-table="Grafik Penjualan Bulanan">
          <DetailTableHead>
            <DetailTableTh>Bulan</DetailTableTh>
            <DetailTableTh align="right">Jumlah Faktur</DetailTableTh>
            <DetailTableTh align="right">Penjualan</DetailTableTh>
            <DetailTableTh>Grafik</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {monthly.map((row) => (
              <DetailTableRow key={row.month}>
                <DetailTableTd>{row.label}</DetailTableTd>
                <DetailTableTd align="right">{row.invoiceCount}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.revenue, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd>
                  <div className="h-3 w-full min-w-[80px] rounded bg-muted">
                    <div className="h-3 rounded bg-primary" style={{ width: `${Math.round((row.revenue / maxMonthly) * 100)}%` }} />
                  </div>
                </DetailTableTd>
              </DetailTableRow>
            ))}
            {monthly.length === 0 && (
              <DetailTableRow>
                <DetailTableTd colSpan={4} className="text-center text-muted-foreground py-6"><EmptyState title="Belum ada data penjualan" className="py-0" /></DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}
