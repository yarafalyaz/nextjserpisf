export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { safeRound } from '@/lib/utils/math'
import { requirePermission } from '@/lib/auth/permissions'
import { getWarehouseScope } from '@/lib/auth/warehouse-scope'
import { formatAccounting, formatDate, formatReferenceType, referenceHref } from '@/lib/utils/format'
import { toLocalDateOnly } from '@/lib/utils/date-only'
import { buildStockCard, type StockCardMove } from '@/lib/reports/stock-card'
import { resolveReferenceSlugs, referenceSlugKey } from '@/lib/services/reference-slug.service'
import { reportPeriodFromRoute, splitReportSegments } from '@/lib/reports/report-period'
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
  const user = await requirePermission('view_reports')
  const scope = await getWarehouseScope({ id: user.id, roles: user.roles ?? [] })
  // undefined = all-access (tanpa penegakan); array (termasuk kosong) = ditegakkan.
  const scopeIds: number[] | undefined =
    scope.kind === 'all' ? undefined : scope.kind === 'assigned' ? scope.warehouseIds : []

  const [{ segments = [] }, search] = await Promise.all([params, searchParams])

  // Periode dari path; tautan lama (?tanggalMulai=) tetap dihormati. Aturannya
  // hidup di satu tempat, `reportPeriodFromRoute`.
  const period = await reportPeriodFromRoute(params, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))
  const startDate = period.start
  const endDate = period.end

  // splitReportSegments: tanpa periode, segmen pertama adalah filter — slice(1) membuangnya.
  const filters = splitReportSegments(segments).filters

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

  // Opsi dropdown gudang dibatasi ke scope; resolver di atas tetap daftar penuh
  // (tautan lama tetap terbaca, lalu ditegakkan di baseWhere).
  const scopedWarehouses = scopeIds ? warehouses.filter((w) => scopeIds.includes(w.id)) : warehouses

  // Gudang terpilih di luar scope -> { in: [] } (kosong); tanpa filter +
  // assigned -> hanya gudang scope; all -> perilaku lama.
  const warehouseWhere: { warehouseId?: number | { in: number[] } } = !scopeIds
    ? warehouseId
      ? { warehouseId }
      : {}
    : warehouseId
      ? scopeIds.includes(warehouseId)
        ? { warehouseId }
        : { warehouseId: { in: [] } }
      : { warehouseId: { in: scopeIds } }

  let card = null as ReturnType<typeof buildStockCard> | null
  if (itemId && selectedItem) {
    const baseWhere = {
      itemId,
      status: 'posted' as const,
      ...warehouseWhere,
    }

    const [priorAgg, periodMoves] = await Promise.all([
      // Saldo awal diagregasi di DB (pola stock-flow-data PDF) — sebelumnya
      // seluruh move pra-periode dimuat ke memori hanya untuk dijumlahkan
      // (putaran 82). Selisih sub-sen vs penjumlahan per-baris diterima sama
      // seperti jalur PDF. Scope kosong: jangan hasilkan `IN ()` invalid.
      scopeIds && scopeIds.length === 0
        ? Promise.resolve([] as Array<{ impact: string; qty: unknown; value: unknown }>)
        : prisma.$queryRaw<Array<{ impact: string; qty: unknown; value: unknown }>>`
        SELECT impact, SUM(qty) AS qty, SUM(qty * cost) AS value
        FROM stock_moves
        WHERE item_id = ${itemId} AND status = 'posted' AND transaction_date < ${startDate}
        ${
          warehouseId
            ? Prisma.sql`AND warehouse_id = ${warehouseId}`
            : scopeIds
              ? Prisma.sql`AND warehouse_id IN (${Prisma.join(scopeIds)})`
              : Prisma.empty
        }
        GROUP BY impact
      `,
      prisma.stockMove.findMany({
        where: { ...baseWhere, date: { gte: startDate, lte: endDate } },
        include: { warehouse: { select: { code: true } } },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      }),
    ])

    const openingRaw = priorAgg.reduce(
      (acc, row) => {
        const qty = Number(row.qty ?? 0)
        const value = Number(row.value ?? 0)
        return row.impact === "IN"
          ? { qty: acc.qty + qty, value: acc.value + value }
          : { qty: acc.qty - qty, value: acc.value - value }
      },
      { qty: 0, value: 0 },
    )
    const opening = {
      qty: safeRound(openingRaw.qty, 2),
      value: safeRound(openingRaw.value, 2),
    }

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

  const periodLabel = `Periode ${formatDate(startDate)} – ${formatDate(endDate)}`
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
            options: scopedWarehouses.map((w) => ({ value: w.slug ?? String(w.id), label: `${w.code} — ${w.name}` })),
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
                      <DetailTableTd>{formatDate(row.date, { format: "numeric" })}</DetailTableTd>
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
