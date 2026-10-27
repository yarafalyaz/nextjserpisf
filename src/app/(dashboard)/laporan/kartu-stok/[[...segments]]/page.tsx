export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { formatAccounting, formatReferenceType, referenceHref } from '@/lib/utils/format'
import { toLocalDateOnly } from '@/lib/utils/date-only'
import { buildStockCard, openingBalance, type StockCardMove } from '@/lib/reports/stock-card'
import { resolveReferenceSlugs, referenceSlugKey } from '@/lib/services/reference-slug.service'
import { reportPeriodFromRoute } from '@/lib/reports/report-period'
import { parseReportFilters } from '@/lib/reports/report-href'
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from '@/components/ui/detail-table'
import { EmptyState } from '@/components/ui/empty-state'
import { ExportButtons } from '@/components/reports/export-buttons'
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { ReportLetterhead } from '@/components/reports/report-letterhead'
import { ReportSection, ReportKpiCard } from '@/components/reports/report-section'
import { ReportNarration } from '@/components/reports/report-narration'
import { ReportPeriodFilter } from '@/components/reports/report-period-filter'

import type { Metadata } from 'next'
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Kartu Stok" }

/**
 * Filter dicari lewat slug lebih dulu (URL terbaca), lalu id numerik sebagai
 * cadangan — sama seperti `entityHref`, sehingga tautan lama dan baris yang
 * belum punya slug tetap bisa dibuka.
 */
function findByFilterKey<T extends { id: number; slug: string | null }>(
  rows: T[],
  key: string | undefined,
): T | null {
  if (!key) return null
  return rows.find((row) => row.slug === key) ?? rows.find((row) => String(row.id) === key) ?? null
}

export default async function StockCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{
    itemId?: string
    warehouseId?: string
    tanggalMulai?: string
    tanggalSelesai?: string
  }>
}) {
  await requirePermission('view_reports')

  const [{ segments = [] }, search] = await Promise.all([params, searchParams])

  // Periode dari path; tautan lama (?tanggalMulai=) tetap dihormati. Aturannya
  // hidup di satu tempat, `reportPeriodFromRoute`.
  const period = await reportPeriodFromRoute(params, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))
  const startDate = period.start
  const endDate = period.end

  const filters = parseReportFilters(segments.slice(1))

  const [items, warehouses] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, sku: true, name: true, unitOfMeasure: true },
    }),
    prisma.warehouse.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { code: 'asc' },
      select: { id: true, slug: true, code: true, name: true },
    }),
  ])

  const selectedItem = findByFilterKey(items, filters.barang ?? search.itemId)
  const selectedWarehouse = findByFilterKey(warehouses, filters.gudang ?? search.warehouseId)
  const itemId = selectedItem?.id ?? null
  const warehouseId = selectedWarehouse?.id ?? null

  let card = null as ReturnType<typeof buildStockCard> | null
  if (itemId && selectedItem) {
    const baseWhere = {
      itemId,
      status: 'posted' as const,
      ...(warehouseId ? { warehouseId } : {}),
    }

    const [priorMoves, periodMoves] = await Promise.all([
      prisma.stockMove.findMany({
        where: { ...baseWhere, date: { lt: startDate } },
        select: { qty: true, cost: true, impact: true },
      }),
      prisma.stockMove.findMany({
        where: { ...baseWhere, date: { gte: startDate, lte: endDate } },
        include: { warehouse: { select: { code: true } } },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      }),
    ])

    const opening = openingBalance(
      priorMoves.map((m) => ({ qty: Number(m.qty), cost: Number(m.cost), impact: m.impact })),
    )

    const moves: StockCardMove[] = periodMoves.map((m) => ({
      id: m.id,
      date: m.date ?? m.createdAt,
      documentNo: m.documentNo,
      moveType: m.moveType,
      impact: m.impact,
      qty: Number(m.qty),
      cost: Number(m.cost),
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      description: m.description,
      warehouseCode: m.warehouse?.code ?? null,
    }))

    card = buildStockCard(moves, opening)
  }

  // Slug dokumen sumber untuk tautan referensi (kanonis, bukan id numerik).
  const referenceSlugs = card
    ? await resolveReferenceSlugs(card.rows)
    : new Map<string, string>()

  const periodLabel = `Periode ${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
  const eyebrow = selectedItem
    ? `${selectedItem.sku} — ${selectedItem.name} (${selectedItem.unitOfMeasure})`
    : undefined

  return (
    <ReportPageShell title="Kartu Stok" sheet={false} wide filter={<>
<ReportPeriodFilter
        basePath="/laporan/kartu-stok"
        mode="range"
        defaultStartDate={toLocalDateOnly(startDate)}
        defaultEndDate={toLocalDateOnly(endDate)}
        selects={[
          {
            param: "barang",
            label: "Barang",
            placeholder: "Cari barang (SKU / nama)...",
            required: true,
            value: selectedItem ? (selectedItem.slug ?? String(selectedItem.id)) : "",
            options: items.map((item) => ({ value: item.slug ?? String(item.id), label: `${item.sku} — ${item.name}` })),
          },
          {
            param: "gudang",
            label: "Gudang",
            placeholder: "Semua Gudang",
            value: selectedWarehouse ? (selectedWarehouse.slug ?? String(selectedWarehouse.id)) : "",
            options: warehouses.map((w) => ({ value: w.slug ?? String(w.id), label: `${w.code} — ${w.name}` })),
          },
        ]}
      />
</>}>




      {!card ? (
        <ReportSection title="Kartu Stok">
          <p className="py-8 text-center text-sm text-muted-foreground">
            Pilih barang terlebih dahulu untuk menampilkan kartu stok.
          </p>
        </ReportSection>
      ) : (
        <>
          <div className="flex items-center justify-end print:hidden">
            <ExportButtons
              title="Kartu_Stok"
              pdfHref={buildReportPdfHref("kartu-stok", period.slug, {
                barang: selectedItem ? (selectedItem.slug ?? String(selectedItem.id)) : "",
                ...(selectedWarehouse ? { gudang: selectedWarehouse.slug ?? String(selectedWarehouse.id) } : {}),
              })}
            />
          </div>

          <ReportLetterhead title="Kartu Stok" subtitle={eyebrow} periodLabel={periodLabel} />
          <ReportNarration text="Kartu Stok menampilkan riwayat pergerakan persediaan satu barang secara kronologis beserta saldo berjalan (kuantitas dan nilai). Laporan ini dipakai untuk menelusuri sumber setiap kenaikan/penurunan stok dan mencocokkan saldo fisik dengan catatan." />

          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
            <ReportKpiCard label="Saldo Awal (Qty)" value={formatAccounting(card.openingQty, { zeroDash: false })} />
            <ReportKpiCard label="Total Masuk (Qty)" value={formatAccounting(card.totalInQty, { zeroDash: false })} valueClassName="text-success" />
            <ReportKpiCard label="Total Keluar (Qty)" value={formatAccounting(card.totalOutQty, { zeroDash: false })} valueClassName="text-danger" />
            <ReportKpiCard label="Saldo Akhir (Qty)" value={formatAccounting(card.closingQty, { zeroDash: false })} />
          </div>

          <ReportSection title="Kartu Stok">
            <DetailTable data-report-table="Kartu Stok">
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Dokumen</DetailTableTh>
                <DetailTableTh>Jenis</DetailTableTh>
                <DetailTableTh>Gudang</DetailTableTh>
                <DetailTableTh align="right">Masuk</DetailTableTh>
                <DetailTableTh align="right">Keluar</DetailTableTh>
                <DetailTableTh align="right">Saldo</DetailTableTh>
                <DetailTableTh align="right">Harga Satuan</DetailTableTh>
                <DetailTableTh align="right">Nilai</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                <DetailTableRow className="bg-muted/40">
                  <DetailTableTd colSpan={4} className="font-semibold">Saldo Awal</DetailTableTd>
                  <DetailTableTd align="right">–</DetailTableTd>
                  <DetailTableTd align="right">–</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatAccounting(card.openingQty, { zeroDash: false })}</DetailTableTd>
                  <DetailTableTd align="right">–</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatAccounting(card.openingValue, { zeroDash: false })}</DetailTableTd>
                </DetailTableRow>

                {card.rows.map((row) => {
                  const href = referenceHref(row.referenceType, row.referenceId, referenceSlugs.get(referenceSlugKey(row)))
                  return (
                    <DetailTableRow key={row.id}>
                      <DetailTableTd>{row.date.toLocaleDateString('id-ID')}</DetailTableTd>
                      <DetailTableTd className="font-mono text-xs">
                        {href ? <Link href={href} className="text-primary hover:underline">{row.documentNo}</Link> : row.documentNo}
                      </DetailTableTd>
                      <DetailTableTd className="text-xs">
                        {row.referenceType ? formatReferenceType(row.referenceType) : (row.moveType || '–')}
                      </DetailTableTd>
                      <DetailTableTd className="text-xs">{row.warehouseCode ?? '–'}</DetailTableTd>
                      <DetailTableTd align="right" className="text-success">
                        {row.impact === 'IN' ? formatAccounting(row.qty, { zeroDash: false }) : '–'}
                      </DetailTableTd>
                      <DetailTableTd align="right" className="text-danger">
                        {row.impact === 'OUT' ? formatAccounting(row.qty, { zeroDash: false }) : '–'}
                      </DetailTableTd>
                      <DetailTableTd align="right" className="font-semibold">{formatAccounting(row.balanceQty, { zeroDash: false })}</DetailTableTd>
                      <DetailTableTd align="right">{formatAccounting(row.cost, { zeroDash: false })}</DetailTableTd>
                      <DetailTableTd align="right">{formatAccounting(row.value, { zeroDash: false })}</DetailTableTd>
                    </DetailTableRow>
                  )
                })}

                {card.rows.length === 0 && (
                  <DetailTableRow>
                    <DetailTableTd colSpan={9} className="text-center text-muted-foreground py-6">
                      <EmptyState title="Tidak ada pergerakan stok pada periode ini" className="py-0" />
                    </DetailTableTd>
                  </DetailTableRow>
                )}

                <DetailTableRow className="border-t-2 border-default font-bold">
                  <DetailTableTd colSpan={4}>Saldo Akhir</DetailTableTd>
                  <DetailTableTd align="right" className="text-success">{formatAccounting(card.totalInQty, { zeroDash: false })}</DetailTableTd>
                  <DetailTableTd align="right" className="text-danger">{formatAccounting(card.totalOutQty, { zeroDash: false })}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(card.closingQty, { zeroDash: false })}</DetailTableTd>
                  <DetailTableTd align="right">–</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(card.closingValue, { zeroDash: false })}</DetailTableTd>
                </DetailTableRow>
              </DetailTableBody>
            </DetailTable>
          </ReportSection>
        </>
      )}
    </ReportPageShell>
  )
}
