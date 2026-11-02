/**
 * Pemuatan data untuk laporan **Stok Nomor Seri/Batch per Gudang**.
 *
 * Membaca `ItemSerial` dan `ItemBatch` beserta barang & gudangnya. Filter gudang
 * opsional (slug di path `/gudang/<slug>`, `?warehouseId=` lama tetap dibaca).
 * Jumlah barang yang mengaktifkan pelacakan ikut dihitung supaya laporan bisa
 * membedakan "pelacakan belum dipakai" dari "pelacakan aktif tapi belum ada
 * catatan" — lihat `serial-batch-stock.ts`.
 *
 * Hanya POSISI yang tampil: seri `available`/`reserved` (seri `used` sudah
 * terpakai/keluar gudang — ditandai FIFO saat penjualan; `sold`/`damaged`
 * dan status lain juga bukan posisi), batch dengan `qty > 0` (lot habis
 * tidak dihapus FIFO tetapi bukan stok), dan hanya barang hidup — sama
 * seperti penyebut `trackedItems` dan loader stok kembar
 * (slow-moving/min-stock).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildExpiryActionQueue,
  buildSerialBatchStock,
  type ExpiryActionQueue,
  type SerialBatchInput,
  type SerialBatchResult,
} from "@/lib/reports/serial-batch-stock"

export interface SerialBatchReport {
  report: SerialBatchResult
  expiryQueue: ExpiryActionQueue
  asOf: Date
}

export async function loadSerialBatchStock(options: {
  warehouseId?: number | null
  asOf: Date
  // ROUND5-SCOPE: undefined = tanpa penegakan; array ditegakkan. Gudang
  // terpilih di luar cakupan -> hasil kosong; tanpa pilihan -> in cakupan.
  scopeWarehouseIds?: number[] | null
}): Promise<SerialBatchReport> {
  const { warehouseId = null, asOf, scopeWarehouseIds } = options
  const warehouseWhere =
    scopeWarehouseIds != null
      ? warehouseId
        ? scopeWarehouseIds.includes(warehouseId)
          ? { warehouseId }
          : { warehouseId: { in: [] as number[] } }
        : { warehouseId: { in: scopeWarehouseIds } }
      : warehouseId
        ? { warehouseId }
        : {}

  const [serials, batches, trackedItems] = await Promise.all([
    prisma.itemSerial.findMany({
      where: {
        ...warehouseWhere,
        status: { in: ["available", "reserved"] },
        item: { isActive: true, deletedAt: null },
      },
      select: {
        serialNumber: true,
        status: true,
        item: { select: { sku: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { serialNumber: "asc" },
    }),
    prisma.itemBatch.findMany({
      where: {
        ...warehouseWhere,
        qty: { gt: 0 },
        item: { isActive: true, deletedAt: null },
      },
      select: {
        batchNumber: true,
        qty: true,
        manufacturingDate: true,
        expiryDate: true,
        item: { select: { sku: true, name: true, cost: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { batchNumber: "asc" },
    }),
    prisma.item.count({
      where: { isActive: true, deletedAt: null, OR: [{ trackSerial: true }, { trackBatch: true }] },
    }),
  ])

  const records: SerialBatchInput[] = [
    ...serials.map((serial) => ({
      kind: "serial" as const,
      itemSku: serial.item.sku,
      itemName: serial.item.name,
      warehouseId: serial.warehouse.id,
      warehouseName: serial.warehouse.name,
      code: serial.serialNumber,
      status: serial.status,
      qty: 1,
      manufacturingDate: null,
      expiryDate: null,
    })),
    ...batches.map((batch) => ({
      kind: "batch" as const,
      itemSku: batch.item.sku,
      itemName: batch.item.name,
      warehouseId: batch.warehouse.id,
      warehouseName: batch.warehouse.name,
      code: batch.batchNumber,
      status: null,
      qty: Number(batch.qty),
      manufacturingDate: batch.manufacturingDate,
      expiryDate: batch.expiryDate,
      unitCost: Number(batch.item.cost),
    })),
  ]

  return {
    report: buildSerialBatchStock({ records, asOf, trackedItems }),
    expiryQueue: buildExpiryActionQueue(records, asOf),
    asOf,
  }
}
