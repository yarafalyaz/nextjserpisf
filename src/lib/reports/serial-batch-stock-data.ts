/**
 * Pemuatan data untuk laporan **Stok Nomor Seri/Batch per Gudang**.
 *
 * Membaca `ItemSerial` dan `ItemBatch` beserta barang & gudangnya. Filter gudang
 * opsional (slug di path `/gudang/<slug>`, `?warehouseId=` lama tetap dibaca).
 * Jumlah barang yang mengaktifkan pelacakan ikut dihitung supaya laporan bisa
 * membedakan "pelacakan belum dipakai" dari "pelacakan aktif tapi belum ada
 * catatan" — lihat `serial-batch-stock.ts`.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildSerialBatchStock,
  type SerialBatchInput,
  type SerialBatchResult,
} from "@/lib/reports/serial-batch-stock"

export interface SerialBatchReport {
  report: SerialBatchResult
  asOf: Date
}

export async function loadSerialBatchStock(options: {
  warehouseId?: number | null
  asOf: Date
}): Promise<SerialBatchReport> {
  const { warehouseId = null, asOf } = options
  const warehouseWhere = warehouseId ? { warehouseId } : {}

  const [serials, batches, trackedItems] = await Promise.all([
    prisma.itemSerial.findMany({
      where: { ...warehouseWhere },
      select: {
        serialNumber: true,
        status: true,
        item: { select: { sku: true, name: true } },
        warehouse: { select: { name: true } },
      },
      orderBy: { serialNumber: "asc" },
    }),
    prisma.itemBatch.findMany({
      where: { ...warehouseWhere },
      select: {
        batchNumber: true,
        qty: true,
        manufacturingDate: true,
        expiryDate: true,
        item: { select: { sku: true, name: true } },
        warehouse: { select: { name: true } },
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
      warehouseName: batch.warehouse.name,
      code: batch.batchNumber,
      status: null,
      qty: Number(batch.qty),
      manufacturingDate: batch.manufacturingDate,
      expiryDate: batch.expiryDate,
    })),
  ]

  return {
    report: buildSerialBatchStock({ records, asOf, trackedItems }),
    asOf,
  }
}
