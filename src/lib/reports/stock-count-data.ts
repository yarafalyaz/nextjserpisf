/**
 * Data laporan lembar penghitungan stok (stok opname).
 *
 * Sumbernya `StockAdjustment`, karena lembar hitung opname memang tersimpan
 * sebagai penyesuaian stok — itu bentuknya, bukan tabel terpisah. Semua status
 * ikut ditampilkan (draft maupun disetujui): lembar hitung adalah catatan
 * penghitungan fisik, dan menyembunyikan yang belum disetujui justru membuat
 * hasil opname hilang dari laporan.
 */

import { prisma } from "@/lib/db/prisma"
import { buildStockCount, type StockCountResult } from "@/lib/reports/stock-count"
import { rangePeriodLabels } from "@/lib/reports/period-label"

export interface StockCountReport {
  count: StockCountResult
  periodLabel: string
  periodCaption: string
}

export async function loadStockCount(period: {
  start: Date
  end: Date
}): Promise<StockCountReport> {
  const adjustments = await prisma.stockAdjustment.findMany({
    where: { date: { gte: period.start, lte: period.end }, deletedAt: null },
    select: {
      documentNo: true,
      date: true,
      status: true,
      warehouse: { select: { name: true } },
      items: {
        select: { itemId: true, systemQty: true, actualQty: true, unit: true, unitCost: true },
      },
    },
    orderBy: [{ date: "asc" }, { documentNo: "asc" }],
  })

  // `StockAdjustmentItem` tidak punya relasi ke `Item`, jadi nama barangnya
  // diambil sekali untuk semua baris (Item memakai `sku`, bukan `code`).
  const itemIds = [...new Set(adjustments.flatMap((adjustment) => adjustment.items.map((item) => item.itemId)))]
  const items = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, sku: true, name: true },
      })
    : []
  const itemById = new Map(items.map((item) => [item.id, item]))

  return {
    count: buildStockCount({
      documents: adjustments.map((adjustment) => ({
        documentNo: adjustment.documentNo,
        date: adjustment.date,
        warehouseName: adjustment.warehouse?.name ?? null,
        status: adjustment.status,
        items: adjustment.items.map((item) => ({
          sku: itemById.get(item.itemId)?.sku ?? null,
          name: itemById.get(item.itemId)?.name ?? `Barang #${item.itemId}`,
          systemQty: Number(item.systemQty),
          actualQty: Number(item.actualQty),
          unit: item.unit,
          unitCost: Number(item.unitCost),
        })),
      })),
      start: period.start,
      end: period.end,
    }),
    ...rangePeriodLabels(period),
  }
}
