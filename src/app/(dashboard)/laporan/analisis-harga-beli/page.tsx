export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatCurrency } from '@/lib/utils/format'
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
import { buildPurchasePriceAnalysis } from "@/lib/services/purchase-price-analysis.service"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Analisis Harga Beli Multi-Sumber" }

export default async function PurchasePriceAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ itemId?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission('view_reports')
  const params = await searchParams
  const now = new Date()
  const startDate = params.tanggalMulai ? new Date(params.tanggalMulai) : new Date(now.getFullYear(), 0, 1)
  const endDate = params.tanggalSelesai ? new Date(params.tanggalSelesai) : now
  endDate.setHours(23, 59, 59, 999)
  const itemId = params.itemId ? parseInt(params.itemId) : null

  // Items that have posted goods receipts (candidate filter options). Goods
  // receipt items carry only itemId (no Prisma relation), so resolve SKUs via a
  // separate lookup on the distinct item ids.
  const receiptItemIds = await prisma.goodsReceiptItem.findMany({
    where: { goodsReceipt: { status: 'posted' } },
    select: { itemId: true },
    distinct: ['itemId'],
  })
  const items = receiptItemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: receiptItemIds.map((r) => r.itemId) } },
        select: { id: true, sku: true, name: true },
        orderBy: { sku: 'asc' },
        take: 500,
      })
    : []

  const { rows, bestByItem } = await buildPurchasePriceAnalysis({ startDate, endDate, itemId })

  const totalReceipts = rows.reduce((s, r) => s + r.receipts, 0)
  const totalQty = rows.reduce((s, r) => s + r.totalQty, 0)
  const totalValue = rows.reduce((s, r) => s + r.totalQty * r.avgLandedUnitCost, 0)
  // Largest landed-vs-listing uplift (a red flag that listing price is misleading).
  const maxUplift = rows.reduce((m, r) => Math.max(m, r.landedUplift), 0)
  const totalPotentialSaving = bestByItem.reduce((s, b) => s + b.savingVsWorst, 0)
  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Laporan", href: "/laporan" }, { label: "Analisis Harga Beli Multi-Sumber" }]} />
      </div>
      <div className="flex items-center justify-end print:hidden"><ExportButtons title="Analisis_Harga_Beli_Multi_Sumber" /></div>
      <form className="mb-2 flex items-center gap-4 flex-wrap print:hidden">
        <div className="flex flex-col gap-1.5 w-[280px]">
          <Label htmlFor="itemId">Barang</Label>
          <FormSelect id="itemId" name="itemId" defaultValue={params.itemId || undefined}
            placeholder="Semua Barang" options={items.map(i => ({ value: String(i.id), label: `${i.sku} — ${i.name}` }))} />
        </div>
        <AppDatePicker label="Dari" name="tanggalMulai" defaultValue={params.tanggalMulai || startDate.toISOString().split('T')[0]} className="w-[180px]" />
        <AppDatePicker label="Sampai" name="tanggalSelesai" defaultValue={params.tanggalSelesai || endDate.toISOString().split('T')[0]} className="w-[180px]" />
        <Button type="submit" variant="primary" size="sm">Filter</Button>
      </form>
      <ReportLetterhead title="Analisis Harga Beli Multi-Sumber" subtitle="Multi-Source Purchase Price Analysis" periodLabel={periodLabel} />
      <ReportNarration text="Analisis ini membandingkan biaya perolehan efektif (landed cost) barang yang sama antar pemasok dan antar waktu, berdasarkan penerimaan barang (GRN) yang sudah diposting. Harga listing murah belum tentu biaya perolehan termurah setelah ongkir, diskon, dan biaya lain — karena itu perbandingan didasarkan pada biaya perolehan per satuan, bukan harga listing saja (PUR-08)." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Jumlah Penerimaan" value={totalReceipts.toLocaleString('id-ID')} />
        <ReportKpiCard label="Total Qty Diterima" value={totalQty.toLocaleString('id-ID')} />
        <ReportKpiCard label="Nilai Perolehan" value={formatCurrency(totalValue)} />
        <ReportKpiCard label="Uplift Landed Tertinggi" value={formatCurrency(maxUplift)} valueClassName="text-danger" />
        <ReportKpiCard label="Peluang Hemat (per unit)" value={formatCurrency(totalPotentialSaving)} valueClassName="text-success" />
      </div>

      {bestByItem.length > 0 && (
        <ReportSection title="Rekomendasi Sumber Termurah (per Barang)">
          <p className="mb-3 text-sm text-muted-foreground">
            Pemilihan didasarkan pada biaya perolehan per satuan (landed), bukan harga listing. Hanya barang dengan lebih dari satu sumber yang dibandingkan.
          </p>
          <DetailTable data-report-table="Rekomendasi Sumber Termurah">
            <DetailTableHead>
              <DetailTableTh>SKU</DetailTableTh>
              <DetailTableTh>Nama Barang</DetailTableTh>
              <DetailTableTh>Sumber Termurah</DetailTableTh>
              <DetailTableTh align="right">Landed/Unit</DetailTableTh>
              <DetailTableTh align="right">Listing/Unit</DetailTableTh>
              <DetailTableTh align="right">Hemat vs Termahal</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {bestByItem.map((b) => (
                <DetailTableRow key={b.itemId}>
                  <DetailTableTd className="font-mono text-xs">{b.sku}</DetailTableTd>
                  <DetailTableTd className="font-medium">{b.itemName}</DetailTableTd>
                  <DetailTableTd>{b.vendorName}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(b.avgLandedUnitCost)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(b.avgListingUnitPrice)}</DetailTableTd>
                  <DetailTableTd align="right" className="text-success font-semibold">{formatCurrency(b.savingVsWorst)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </ReportSection>
      )}

      <ReportSection title="Perbandingan Biaya Perolehan per Pemasok">
        <DetailTable data-report-table="Analisis Harga Beli Multi-Sumber">
          <DetailTableHead>
            <DetailTableTh>SKU</DetailTableTh>
            <DetailTableTh>Nama Barang</DetailTableTh>
            <DetailTableTh>Pemasok</DetailTableTh>
            <DetailTableTh align="right">Penerimaan</DetailTableTh>
            <DetailTableTh align="right">Total Qty</DetailTableTh>
            <DetailTableTh align="right">Landed/Unit</DetailTableTh>
            <DetailTableTh align="right">Listing/Unit</DetailTableTh>
            <DetailTableTh align="right">Uplift</DetailTableTh>
            <DetailTableTh align="right">Terendah</DetailTableTh>
            <DetailTableTh align="right">Tertinggi</DetailTableTh>
            <DetailTableTh>Terakhir</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((r, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-mono text-xs">{r.sku}</DetailTableTd>
                <DetailTableTd className="font-medium">{r.itemName}</DetailTableTd>
                <DetailTableTd>{r.vendorName}</DetailTableTd>
                <DetailTableTd align="right">{r.receipts.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right">{r.totalQty.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold">{formatCurrency(r.avgLandedUnitCost)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(r.avgListingUnitPrice)}</DetailTableTd>
                <DetailTableTd align="right" className={r.landedUplift > 0 ? 'text-danger' : 'text-success'}>
                  {r.landedUplift > 0 ? '+' : ''}{formatCurrency(r.landedUplift)}
                </DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(r.minLandedUnitCost)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(r.maxLandedUnitCost)}</DetailTableTd>
                <DetailTableTd className="text-xs">{r.lastReceiptDate ? r.lastReceiptDate.toLocaleDateString('id-ID') : '-'}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={11} className="text-center text-muted-foreground py-6">Tidak ada penerimaan barang pada periode ini</DetailTableTd></DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </div>
  )
}
