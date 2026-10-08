export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExportButtons } from "@/components/reports/export-buttons"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Umur Stok" }

function getAgeGroup(days: number): string {
  if (days <= 30) return "0–30 Hari"
  if (days <= 60) return "31–60 Hari"
  if (days <= 90) return "61–90 Hari"
  return "> 90 Hari"
}

export default async function StockAgingPage() {
  await requirePermission('view_reports')

  const layers = await prisma.inventoryLayer.findMany({
    where: { remaining: { gt: 0 } },
    include: {
      item: { select: { sku: true, name: true, unitOfMeasure: true, category: { select: { name: true } } } },
    },
  })

  const now = new Date()
  interface Row { sku: string; name: string; category: string; uom: string; qty: number; ageDays: number; ageGroup: string }
  const rows: Row[] = layers.map(layer => {
    const ageDays = Math.ceil((now.getTime() - new Date(layer.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    return {
      sku: layer.item.sku, name: layer.item.name, category: layer.item.category?.name || '-',
      uom: layer.item.unitOfMeasure, qty: Number(layer.remaining), ageDays, ageGroup: getAgeGroup(ageDays),
    }
  }).sort((a, b) => b.ageDays - a.ageDays)

  const totalQty = rows.reduce((s, r) => s + r.qty, 0)

  const agingSummary = new Map<string, { count: number; qty: number }>()
  ;['0–30 Hari', '31–60 Hari', '61–90 Hari', '> 90 Hari'].forEach(g => agingSummary.set(g, { count: 0, qty: 0 }))
  for (const row of rows) {
    const existing = agingSummary.get(row.ageGroup)!
    existing.count++; existing.qty += row.qty
  }

  const periodLabel = `Per ${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" }, { label: "Laporan", href: "/laporan" }, { label: "Umur Stok" },
        ]} />
      </div>
      <div className="flex items-center justify-end print:hidden"><ExportButtons title="Umur_Stok" /></div>
      <ReportLetterhead title="Umur Stok" subtitle="Analisis Umur Persediaan" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Umur Stok mengelompokkan persediaan barang berdasarkan lama penyimpanan di gudang. Analisis umur stok membantu mengidentifikasi barang yang lambat bergerak (slow-moving) atau berpotensi usang (obsolete) sehingga dapat dilakukan tindakan penjualan atau write-off." />
      <ReportSection title="Ringkasan Umur Stok">
        <DetailTable data-report-table="Ringkasan Umur Stok">
          <DetailTableHead>
            <DetailTableTh>Kategori Umur</DetailTableTh><DetailTableTh align="right">Jumlah</DetailTableTh><DetailTableTh align="right">Total Qty</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {Array.from(agingSummary.entries()).map(([key, val]) => (
              <DetailTableRow key={key}>
                <DetailTableTd>{key}</DetailTableTd>
                <DetailTableTd align="right">{val.count}</DetailTableTd>
                <DetailTableTd align="right">{val.qty.toLocaleString('id-ID')}</DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
      <ReportSection title="Detail Umur Stok">
        <DetailTable data-report-table="Detail Umur Stok">
          <DetailTableHead>
            <DetailTableTh>SKU</DetailTableTh><DetailTableTh>Nama Item</DetailTableTh><DetailTableTh>Kategori</DetailTableTh>
            <DetailTableTh>Satuan</DetailTableTh><DetailTableTh align="right">Qty</DetailTableTh><DetailTableTh align="right">Umur (Hari)</DetailTableTh><DetailTableTh>Kelompok</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((r, i) => (
              <DetailTableRow key={i}>
                <DetailTableTd className="font-mono text-sm">{r.sku}</DetailTableTd>
                <DetailTableTd className="font-medium">{r.name}</DetailTableTd>
                <DetailTableTd>{r.category}</DetailTableTd>
                <DetailTableTd>{r.uom}</DetailTableTd>
                <DetailTableTd align="right">{r.qty.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right">{r.ageDays}</DetailTableTd>
                <DetailTableTd>{r.ageGroup}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={7} className="text-center text-muted-foreground py-6">Tidak ada stok</DetailTableTd></DetailTableRow>
            )}
            {rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={4}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{totalQty.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd colSpan={2}>{""}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </div>
  )
}
