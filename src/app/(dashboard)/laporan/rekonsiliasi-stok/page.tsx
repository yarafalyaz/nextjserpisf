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
import {
  reconcileInventory,
  type ItemLayerTotals,
} from "@/lib/inventory/stock-reconciliation"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Rekonsiliasi Stok" }

export default async function StockReconciliationPage() {
  await requirePermission('view_reports')

  // Load the master counter and the FIFO layer ledger, then compare them.
  //
  // Include items whose layers exist but master counter is zero (and vice
  // versa). We deliberately do NOT filter `qtyOnHand > 0`: an item whose master
  // counter drifted to 0 while layers remain is exactly the corruption this
  // report exists to surface, so it must not be filtered out.
  const [items, layers] = await Promise.all([
    prisma.item.findMany({
      where: { deletedAt: null },
      select: { id: true, sku: true, name: true, qtyOnHand: true },
      orderBy: { name: 'asc' },
    }),
    prisma.inventoryLayer.findMany({
      where: { remaining: { gt: 0 } },
      select: { itemId: true, remaining: true, unitCost: true },
    }),
  ])

  // Roll up layers per item (Σ remaining, Σ remaining × unitCost).
  const layerTotals = new Map<number, ItemLayerTotals>()
  for (const layer of layers) {
    const agg = layerTotals.get(layer.itemId) || { layerQty: 0, layerValue: 0 }
    const remaining = Number(layer.remaining)
    agg.layerQty += remaining
    agg.layerValue += remaining * Number(layer.unitCost)
    layerTotals.set(layer.itemId, agg)
  }

  // Items that have layers but are missing from the master list (soft-deleted
  // or hard-removed) must still be reconciled, else their orphaned layers hide.
  const itemById = new Map(items.map((i) => [i.id, i]))
  const orphanLayerItemIds = [...layerTotals.keys()].filter((id) => !itemById.has(id))
  const orphanItems = orphanLayerItemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: orphanLayerItemIds } },
        select: { id: true, sku: true, name: true, qtyOnHand: true },
      })
    : []

  const summary = reconcileInventory(
    [...items, ...orphanItems].map((i) => ({
      itemId: i.id,
      sku: i.sku,
      name: i.name,
      masterQty: Number(i.qtyOnHand),
    })),
    layerTotals,
  )

  const periodLabel = `Per ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Laporan", href: "/laporan" },
          { label: "Rekonsiliasi Stok" },
        ]} />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Rekonsiliasi_Stok" />
      </div>

      <ReportLetterhead title="Rekonsiliasi Stok" subtitle="Stock Reconciliation" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Rekonsiliasi Stok membandingkan jumlah stok pada data induk barang (qty on-hand) dengan jumlah pada lapisan FIFO (lot per gudang). Keduanya seharusnya selalu sama; selisih menandakan ada mutasi yang memperbarui salah satu saja, sehingga angka stok bisa menyesatkan. Gunakan laporan ini sebagai alat kontrol integritas persediaan." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Item" value={summary.totalItems.toLocaleString('id-ID')} />
        <ReportKpiCard
          label="Item Selisih"
          value={summary.mismatchCount.toLocaleString('id-ID')}
          valueClassName={summary.mismatchCount > 0 ? 'text-danger' : 'text-success'}
        />
        <ReportKpiCard label="Total Qty (Induk)" value={summary.totalMasterQty.toLocaleString('id-ID')} />
        <ReportKpiCard label="Total Qty (FIFO)" value={summary.totalLayerQty.toLocaleString('id-ID')} />
        <ReportKpiCard label="Nilai Persediaan (FIFO)" value={formatCurrency(summary.totalLayerValue)} valueClassName="text-primary" />
      </div>

      <ReportSection title={`Item Selisih (${summary.mismatches.length})`}>
        <DetailTable data-report-table="Item Selisih">
          <DetailTableHead>
            <DetailTableTh>SKU</DetailTableTh>
            <DetailTableTh>Nama Item</DetailTableTh>
            <DetailTableTh align="right">Qty Induk</DetailTableTh>
            <DetailTableTh align="right">Qty FIFO</DetailTableTh>
            <DetailTableTh align="right">Selisih</DetailTableTh>
            <DetailTableTh align="right">Nilai FIFO</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {summary.mismatches.map((row) => (
              <DetailTableRow key={row.itemId}>
                <DetailTableTd className="font-mono text-sm">{row.sku}</DetailTableTd>
                <DetailTableTd className="font-medium">{row.name}</DetailTableTd>
                <DetailTableTd align="right">{row.masterQty.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd align="right">{row.layerQty.toLocaleString('id-ID')}</DetailTableTd>
                <DetailTableTd
                  align="right"
                  className={row.variance > 0 ? 'text-danger font-semibold' : 'text-danger font-semibold'}
                >
                  {row.variance > 0 ? '+' : ''}{row.variance.toLocaleString('id-ID')}
                </DetailTableTd>
                <DetailTableTd align="right" className="font-semibold">{formatAccounting(row.layerValue)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {summary.mismatches.length === 0 && (
              <DetailTableRow>
                <DetailTableTd colSpan={6} className="text-center text-success py-8">
                  Semua item seimbang — jumlah induk sama dengan total lapisan FIFO.
                </DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </div>
  )
}
