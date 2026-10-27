export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { toLocalDateOnly } from '@/lib/utils/date-only'
import { AppBreadcrumbs } from '@/components/ui/breadcrumbs'
import { ReportSection } from '@/components/reports/report-section'
import { ReportPeriodFilter } from '@/components/reports/report-period-filter'
import { reportPeriodFromRoute } from '@/lib/reports/report-period'
import { parseReportFilters } from '@/lib/reports/report-href'
import { EmptyState } from "@/components/ui/empty-state"
import { OpnameForm } from '../_components/opname-form'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: "Stok Opname" }

/**
 * Stok Opname — stock count sheet.
 *
 * The operator picks a warehouse, the sheet lists every item that currently has
 * stock there with its system quantity, and the counted quantity is entered per
 * line. Submitting creates ONE draft Stock Adjustment holding every variance, so
 * posting (FIFO consumption + journal) reuses the proven Penyesuaian flow.
 */
export default async function StockOpnamePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ warehouseId?: string; date?: string }>
}) {
  await requirePermission("view_stock_opname")

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: 'asc' },
    select: { id: true, slug: true, code: true, name: true },
  })

  // Tanggal opname adalah periode "per tanggal"; tautan lama (?date=) tetap dibaca.
  const period = await reportPeriodFromRoute(
    routeParams,
    searchParams,
    (now) => ({ start: now, end: now }),
    { legacyParam: "date" },
  )
  const date = toLocalDateOnly(period.start)

  // Gudang kini di path (`/gudang/<slug>`); `?warehouseId=` lama tetap dibaca.
  // Tanpa keduanya dipakai gudang pertama, seperti perilaku sebelumnya.
  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const warehouseKey = parseReportFilters(segments.slice(1)).gudang ?? search.warehouseId ?? null
  const warehouseRow = warehouseKey
    ? warehouses.find((w) => w.slug === warehouseKey) ?? warehouses.find((w) => String(w.id) === warehouseKey) ?? null
    : warehouses[0] ?? null
  const warehouseId = warehouseRow?.id ?? null

  const rows =
    warehouseId != null
      ? await (async () => {
          const layers = await prisma.inventoryLayer.groupBy({
            by: ["itemId"],
            where: { warehouseId, remaining: { gt: 0 } },
            _sum: { remaining: true },
          })
          const ids = layers.map((l) => l.itemId)
          const items = ids.length
            ? await prisma.item.findMany({
                where: { id: { in: ids } },
                select: { id: true, sku: true, name: true, unitOfMeasure: true, cost: true },
                orderBy: { name: "asc" },
              })
            : []
          const qtyById = new Map(layers.map((l) => [l.itemId, Number(l._sum.remaining ?? 0)]))
          return items.map((item) => ({
            id: item.id,
            sku: item.sku,
            name: item.name,
            uom: item.unitOfMeasure,
            systemQty: qtyById.get(item.id) ?? 0,
            unitCost: Number(item.cost),
          }))
        })()
      : []

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Stok Opname" },
        ]} />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Stok Opname</h1>
        <p className="text-sm text-muted-foreground">
          Isi hasil penghitungan fisik per barang. Selisih terhadap stok sistem akan dibuat sebagai
          <strong> Penyesuaian Stok (draf)</strong> yang tinggal diposting di menu Penyesuaian.
        </p>
      </div>

      <ReportPeriodFilter
        basePath="/inventaris/opname"
        defaultStartDate={date}
        selects={[
          {
            param: "gudang",
            label: "Gudang",
            placeholder: "Cari gudang (kode / nama)...",
            required: true,
            value: warehouseRow ? (warehouseRow.slug ?? String(warehouseRow.id)) : "",
            options: warehouses.map((w) => ({ value: w.slug ?? String(w.id), label: `${w.code} — ${w.name}` })),
          },
        ]}
      />

      {warehouseId == null ? (
        <ReportSection title="Lembar Penghitungan">
          <EmptyState title="Pilih gudang terlebih dahulu." className="py-8" />
        </ReportSection>
      ) : rows.length === 0 ? (
        <ReportSection title="Lembar Penghitungan">
          <EmptyState title="Tidak ada barang bersaldo di gudang ini." className="py-8" />
        </ReportSection>
      ) : (
        <OpnameForm warehouseId={warehouseId} date={date} rows={rows} />
      )}
    </div>
  )
}
