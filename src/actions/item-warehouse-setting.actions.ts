"use server"

/**
 * Inti stok minimum per gudang F-2026-10-22-070-S (induk
 * F-2026-10-21-013, spec BOT 5 + Putusan Q-MS-1 Lead).
 *
 * Penjaga mengikat:
 * - Izin tanpa key baru (Q-MS-1): kelola override = `edit_items`,
 *   baca panel = `view_items` (katalog nyata; TIDAK ada permission baru).
 * - Minimum efektif (BR-MS-02): minStock baris terisi = override pasangan
 *   (item, gudang); minStock null (baris lahir dari lead time) / baris
 *   tidak ada = kembali warisi Item.minStock.
 * - Simpan hanya untuk item stok aktif (bukan jasa, bukan terhapus) dan
 *   gudang aktif; minStock wajib angka >= 0 (0 sah: menonaktifkan
 *   penilaian pasangan itu). Item/gudang nonaktif ditolak berpesan.
 * - Jejak perubahan di ActivityLog pola sales-target (old/new values);
 *   gagal tulis jejak sesudah commit TIDAK menggagalkan perubahan —
 *   dikembalikan sebagai peringatan di respons sukses.
 * - Aksi ini TIDAK PERNAH menulis StockMove/jurnal/reservasi (BR-MS-09).
 */

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"

type Result<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string }

export interface ItemWarehouseSettingRow {
  warehouseId: number
  warehouseName: string
  warehouseCode: string
  /** Stok lapisan gudang itu; null = tidak ada lapisan (tidak dinilai). */
  qtyAtWarehouse: number | null
  /** Minimum efektif yang dipakai laporan/cron. */
  effectiveMinStock: number
  /** Override mentah; null = warisi global. */
  overrideMinStock: number | null
  globalMinStock: number
  minStockSource: "override" | "global"
  settingId: number | null
  /** Lead time penampung titik pesan-ulang (F-2026-10-25-048-S); null = belum diisi. */
  leadTimeDays?: number | null
}

function positiveId(value: unknown, label: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label} tidak valid`)
  return id
}

function parseMinStock(value: unknown): number {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Stok minimum per gudang wajib angka 0 atau lebih")
  }
  return Math.round(n * 100) / 100
}

/** Lead time BR-ROP-03: bilangan bulat >= 0 hari kalender; pecahan/negatif ditolak. */
function parseLeadTimeDays(value: unknown): number {
  const n = typeof value === "string" ? Number(value.trim()) : Number(value)
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("Lead time wajib bilangan bulat 0 hari atau lebih")
  }
  return n
}

async function writeSettingLog(args: {
  userId: number
  action:
    | "item_warehouse_min_stock_set"
    | "item_warehouse_min_stock_removed"
    | "item_warehouse_lead_time_set"
    | "item_warehouse_lead_time_removed"
  settingId: number
  description: string
  oldValues?: Record<string, string | number | boolean | null>
  newValues?: Record<string, string | number | boolean | null>
}): Promise<{ success: boolean }> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: args.userId,
        action: args.action,
        modelType: "ItemWarehouseSetting",
        modelId: args.settingId,
        description: args.description,
        oldValues: args.oldValues ? { ...args.oldValues } : undefined,
        newValues: args.newValues ? { ...args.newValues } : undefined,
      },
    })
    return { success: true }
  } catch (logError) {
    console.error("[item-warehouse-setting] gagal menulis jejak pengaturan", logError)
    return { success: false }
  }
}

async function assertItemAndWarehouse(itemId: number, warehouseId: number) {
  const [item, warehouse] = await Promise.all([
    prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, sku: true, name: true, isActive: true, isService: true, deletedAt: true },
    }),
    prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, name: true, isActive: true, deletedAt: true },
    }),
  ])
  if (!item || item.deletedAt) throw new Error("Barang tidak ditemukan")
  if (!item.isActive) throw new Error("Barang nonaktif tidak bisa diatur stok minimum per gudangnya")
  if (item.isService) throw new Error("Barang jasa tidak punya stok minimum per gudang")
  if (!warehouse || warehouse.deletedAt) throw new Error("Gudang tidak ditemukan")
  if (!warehouse.isActive) throw new Error("Gudang nonaktif tidak bisa diatur stok minimumnya")
  return { item, warehouse }
}

export async function setItemWarehouseMinStock(
  itemIdInput: unknown,
  warehouseIdInput: unknown,
  minStockInput: unknown,
): Promise<Result<{ settingId: number; warning?: string }>> {
  try {
    const user = await requirePermission("edit_items")
    const itemId = positiveId(itemIdInput, "Barang")
    const warehouseId = positiveId(warehouseIdInput, "Gudang")
    const minStock = parseMinStock(minStockInput)
    const { item, warehouse } = await assertItemAndWarehouse(itemId, warehouseId)

    const existing = await prisma.itemWarehouseSetting.findUnique({
      where: { itemId_warehouseId: { itemId, warehouseId } },
      select: { id: true, minStock: true },
    })

    const saved = await prisma.itemWarehouseSetting.upsert({
      where: { itemId_warehouseId: { itemId, warehouseId } },
      create: { itemId, warehouseId, minStock, createdBy: Number(user.id), updatedBy: Number(user.id) },
      update: { minStock, updatedBy: Number(user.id) },
      select: { id: true },
    })

    const log = await writeSettingLog({
      userId: Number(user.id),
      action: "item_warehouse_min_stock_set",
      settingId: saved.id,
      description: existing
        ? `Mengubah stok minimum ${item.sku} ${item.name} di ${warehouse.name} dari ${Number(existing.minStock)} menjadi ${minStock}`
        : `Mengatur stok minimum ${item.sku} ${item.name} di ${warehouse.name} menjadi ${minStock} (sebelumnya warisi global)`,
      oldValues: existing
        ? { itemId, warehouseId, minStock: Number(existing.minStock) }
        : { itemId, warehouseId, minStock: null },
      newValues: { itemId, warehouseId, minStock },
    })

    revalidatePath("/laporan/stok-minimum")
    return {
      success: true,
      settingId: saved.id,
      ...(log.success ? {} : { warning: "Pengaturan tersimpan, tetapi jejak perubahan gagal dicatat." }),
    }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error) }
  }
}

/**
 * Isi lead time penampung titik pesan-ulang (F-2026-10-25-048-S,
 * Q-ROP-2/Q-ROP-3 putusan Lead): satu penampung leadTimeDays per
 * (barang, gudang), edit_items reuse tanpa key baru. Baris baru dari
 * aksi ini lahir dengan minStock NULL = warisi global (BR-ROP-01);
 * lead time tidak boleh membekukan minimum global (perbaiki PR #936).
 * Minimum eksplisit per gudang tetap butuh setItemWarehouseMinStock.
 */
export async function setItemWarehouseLeadTime(
  itemIdInput: unknown,
  warehouseIdInput: unknown,
  leadTimeInput: unknown,
): Promise<Result<{ settingId: number; warning?: string }>> {
  try {
    const user = await requirePermission("edit_items")
    const itemId = positiveId(itemIdInput, "Barang")
    const warehouseId = positiveId(warehouseIdInput, "Gudang")
    const leadTimeDays = parseLeadTimeDays(leadTimeInput)
    const { item, warehouse } = await assertItemAndWarehouse(itemId, warehouseId)

    const existing = await prisma.itemWarehouseSetting.findUnique({
      where: { itemId_warehouseId: { itemId, warehouseId } },
      select: { id: true, leadTimeDays: true },
    })
    const saved = await prisma.itemWarehouseSetting.upsert({
      where: { itemId_warehouseId: { itemId, warehouseId } },
      create: {
        itemId,
        warehouseId,
        minStock: null, // warisi global, bukan snapshot (BR-ROP-01)
        leadTimeDays,
        createdBy: Number(user.id),
        updatedBy: Number(user.id),
      },
      update: { leadTimeDays, updatedBy: Number(user.id) },
      select: { id: true },
    })

    const log = await writeSettingLog({
      userId: Number(user.id),
      action: "item_warehouse_lead_time_set",
      settingId: saved.id,
      description: existing
        ? `Mengubah lead time ${item.sku} ${item.name} di ${warehouse.name} dari ${existing.leadTimeDays ?? "belum diisi"} menjadi ${leadTimeDays} hari`
        : `Mengatur lead time ${item.sku} ${item.name} di ${warehouse.name} menjadi ${leadTimeDays} hari`,
      oldValues: { itemId, warehouseId, leadTimeDays: existing?.leadTimeDays ?? null },
      newValues: { itemId, warehouseId, leadTimeDays },
    })

    revalidatePath("/laporan/stok-minimum")
    return {
      success: true,
      settingId: saved.id,
      ...(log.success ? {} : { warning: "Lead time tersimpan, tetapi jejak perubahan gagal dicatat." }),
    }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error) }
  }
}

/** Kosongkan lead time: pasangan kembali tidak dinilai (BR-ROP-03). */
export async function removeItemWarehouseLeadTime(
  itemIdInput: unknown,
  warehouseIdInput: unknown,
): Promise<Result<{ removed: boolean; warning?: string }>> {
  try {
    const user = await requirePermission("edit_items")
    const itemId = positiveId(itemIdInput, "Barang")
    const warehouseId = positiveId(warehouseIdInput, "Gudang")
    const { item, warehouse } = await assertItemAndWarehouse(itemId, warehouseId)

    const existing = await prisma.itemWarehouseSetting.findUnique({
      where: { itemId_warehouseId: { itemId, warehouseId } },
      select: { id: true, leadTimeDays: true },
    })
    if (!existing || existing.leadTimeDays == null) return { success: true, removed: false }

    await prisma.itemWarehouseSetting.update({
      where: { id: existing.id },
      data: { leadTimeDays: null, updatedBy: Number(user.id) },
    })

    const log = await writeSettingLog({
      userId: Number(user.id),
      action: "item_warehouse_lead_time_removed",
      settingId: existing.id,
      description: `Menghapus lead time ${item.sku} ${item.name} di ${warehouse.name} (sebelumnya ${existing.leadTimeDays} hari); pasangan tidak dinilai untuk titik pesan-ulang`,
      oldValues: { itemId, warehouseId, leadTimeDays: existing.leadTimeDays },
      newValues: { itemId, warehouseId, leadTimeDays: null },
    })

    revalidatePath("/laporan/stok-minimum")
    return {
      success: true,
      removed: true,
      ...(log.success ? {} : { warning: "Lead time terhapus, tetapi jejak perubahan gagal dicatat." }),
    }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error) }
  }
}

export async function removeItemWarehouseMinStock(
  itemIdInput: unknown,
  warehouseIdInput: unknown,
): Promise<Result<{ removed: boolean; warning?: string }>> {
  try {
    const user = await requirePermission("edit_items")
    const itemId = positiveId(itemIdInput, "Barang")
    const warehouseId = positiveId(warehouseIdInput, "Gudang")
    const { item, warehouse } = await assertItemAndWarehouse(itemId, warehouseId)

    const existing = await prisma.itemWarehouseSetting.findUnique({
      where: { itemId_warehouseId: { itemId, warehouseId } },
      select: { id: true, minStock: true, leadTimeDays: true },
    })
    if (!existing) return { success: true, removed: false }

    if (existing.minStock == null) {
      return { success: true, removed: false }
    }
    if (existing.leadTimeDays != null) {
      await prisma.itemWarehouseSetting.update({
        where: { id: existing.id },
        data: { minStock: null, updatedBy: Number(user.id) },
      })
    } else {
      await prisma.itemWarehouseSetting.delete({ where: { id: existing.id } })
    }

    const log = await writeSettingLog({
      userId: Number(user.id),
      action: "item_warehouse_min_stock_removed",
      settingId: existing.id,
      description: `Menghapus stok minimum per gudang ${item.sku} ${item.name} di ${warehouse.name} (sebelumnya ${Number(existing.minStock)}); kembali warisi minimum global`,
      oldValues: { itemId, warehouseId, minStock: existing.minStock == null ? null : Number(existing.minStock) },
      newValues: { itemId, warehouseId, minStock: null },
    })

    revalidatePath("/laporan/stok-minimum")
    return {
      success: true,
      removed: true,
      ...(log.success ? {} : { warning: "Pengaturan terhapus, tetapi jejak perubahan gagal dicatat." }),
    }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error) }
  }
}

/**
 * Baca panel "Stok minimum per gudang" untuk detail barang: semua gudang
 * aktif + stok lapisan + minimum efektif per pasangan. Baca-saja
 * (`view_items`); UI menampilkan angka apa adanya, tidak hitung ulang.
 */
export async function listItemWarehouseSettings(
  itemIdInput: unknown,
): Promise<Result<{ rows: ItemWarehouseSettingRow[]; globalMinStock: number }>> {
  try {
    await requirePermission("view_items")
    const itemId = positiveId(itemIdInput, "Barang")
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, minStock: true, deletedAt: true },
    })
    if (!item || item.deletedAt) throw new Error("Barang tidak ditemukan")

    const [warehouses, settings, layers] = await Promise.all([
      prisma.warehouse.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      prisma.itemWarehouseSetting.findMany({
        where: { itemId },
        select: { id: true, warehouseId: true, minStock: true, leadTimeDays: true },
      }),
      prisma.inventoryLayer.findMany({
        where: { itemId },
        select: { warehouseId: true, remaining: true },
      }),
    ])

    const settingByWarehouse = new Map(settings.map((s) => [s.warehouseId, s]))
    const qtyByWarehouse = new Map<number, number>()
    for (const layer of layers) {
      if (layer.warehouseId == null) continue
      qtyByWarehouse.set(layer.warehouseId, (qtyByWarehouse.get(layer.warehouseId) ?? 0) + Number(layer.remaining))
    }
    const globalMinStock = Number(item.minStock)

    return {
      success: true,
      globalMinStock,
      rows: warehouses.map((w) => {
        const setting = settingByWarehouse.get(w.id)
        const override = setting?.minStock != null ? Number(setting.minStock) : null
        return {
          warehouseId: w.id,
          warehouseName: w.name,
          warehouseCode: w.code,
          qtyAtWarehouse: qtyByWarehouse.has(w.id) ? qtyByWarehouse.get(w.id)! : null,
          effectiveMinStock: override ?? globalMinStock,
          overrideMinStock: override,
          globalMinStock,
          minStockSource: override != null ? ("override" as const) : ("global" as const),
          settingId: setting?.id ?? null,
          leadTimeDays: setting?.leadTimeDays ?? null,
        }
      }),
    }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error) }
  }
}
