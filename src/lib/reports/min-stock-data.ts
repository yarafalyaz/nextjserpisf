/**
 * Pemuatan data untuk laporan **Barang Stok Minimum**.
 *
 * Semua barang aktif ikut dibaca, bukan hanya yang di bawah minimum: mesin
 * laporan perlu tahu apakah ADA barang yang batas minimumnya sudah diisi, supaya
 * bisa membedakan "belum ada yang mencapai minimum" dari "batas minimumnya belum
 * pernah diisi" — dua hal yang kalau disamakan akan membuat daftar kosong terbaca
 * seolah semua stok aman.
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { buildMinStock, type MinStockResult } from "@/lib/reports/min-stock"

export interface MinStockReport {
  report: MinStockResult
  periodLabel: string
  periodCaption: string
}

export async function loadMinStock(period: {
  start: Date
  end: Date
}): Promise<MinStockReport> {
  const items = await prisma.item.findMany({
    where: { isActive: true, deletedAt: null, isService: false },
    select: {
      sku: true,
      name: true,
      unitOfMeasure: true,
      qtyOnHand: true,
      minStock: true,
      cost: true,
      category: { select: { name: true } },
      warehouse: { select: { name: true } },
      vendor: { select: { name: true } },
    },
    orderBy: { sku: "asc" },
  })

  return {
    report: buildMinStock(
      items.map((item) => ({
        sku: item.sku,
        name: item.name,
        unit: item.unitOfMeasure,
        categoryName: item.category?.name ?? null,
        warehouseName: item.warehouse?.name ?? null,
        vendorName: item.vendor?.name ?? null,
        qtyOnHand: Number(item.qtyOnHand),
        minStock: Number(item.minStock),
        cost: Number(item.cost ?? 0),
      })),
    ),
    ...rangePeriodLabels(period),
  }
}
