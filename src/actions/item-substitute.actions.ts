"use server"

/**
 * Inti substitusi part F-2026-10-22-069-S (spec BOT 5 + PUTUSAN BOT 1
 * Q-SUB69-1..4 + vonis BOT 4 F-2026-10-22-075-V Q-SUB69-5).
 *
 * Penjaga mengikat:
 * - Izin tanpa key baru (Q-SUB69-1): kelola relasi = `edit_items`,
 *   lihat master = `view_items` (katalog nyata module-catalog.generated.ts:70-72;
 *   `*_products` di katalog = Produk/BOM manufaktur, bukan master barang), saran WO = `view_work_orders`,
 *   terapkan = `edit_work_orders` (bukan `create_material_issues`).
 * - Relasi SATU ARAH, tidak transitif (BR-SUB69-02): satu baris
 *   ItemSubstitute per arah; arah balik wajib baris sendiri.
 * - AC-SUB69-1: asal != pengganti, kedua item stok aktif (bukan jasa,
 *   bukan nonaktif/terhapus), satuan dasar sama (lintas satuan dasar
 *   ditolak tahap ini — di luar cakupan spec), pasangan aktif ganda
 *   ditolak; nonaktifkan = isActive=false TANPA hapus (riwayat utuh).
 * - BR-SUB69-10: ubah relasi tidak menyentuh WO berjalan/log lama.
 * - Penerapan (BR-SUB69-04/06, Q-SUB69-2/3): validasi ulang server saat
 *   simpan (relasi masih aktif, kedua item masih aktif, fitment
 *   pengganti bukan `incompatible`; `unknown` lolos + tercatat),
 *   alasan WAJIB (BR-SUB69-08), lalu panggil reviseWorkOrderItems
 *   EXISTING persis — baris lama `replaced` (reservasi dilepas mesin
 *   existing), baris pengganti lahir `pending` TANPA reservasi baru,
 *   nol StockMove/jurnal/reservasi dari langkah ini. Cost baris
 *   pengganti = Item.cost master pengganti (snapshot pola baris WO
 *   existing; issue pengganti kelak menagih biaya FIFO item pengganti
 *   sendiri per vonis Q-SUB69-5 — TIDAK ada kolom selisih di sini).
 * - Jejak penerapan: baris ActivityLog khusus `work_order_item_substituted`
 *   berpasangan lama->baru (oldValues/newValues, pola
 *   writeTargetLog sales-target) dengan alasan, qty, dan fitment yang
 *   lolos. Gagal tulis jejak sesudah revisi commit TIDAK dilaporkan
 *   sebagai kegagalan penerapan — dikembalikan sebagai peringatan.
 */

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { reviseWorkOrderItems } from "@/actions/inventory.actions"
import { getWorkOrderSubstituteSuggestions } from "@/lib/reports/item-substitute-suggestions-data"
import {
  configurationFromCustomerVehicle,
  evaluateFitment,
} from "@/lib/services/vehicle-fitment.service"

type Result<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string }

function positiveId(value: unknown, label: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label} tidak valid`)
  return id
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002"
  )
}

const itemGuardSelect = {
  id: true,
  name: true,
  sku: true,
  unitOfMeasure: true,
  isActive: true,
  isService: true,
  deletedAt: true,
  cost: true,
} as const

type ItemGuardRow = {
  id: number
  name: string
  sku: string
  unitOfMeasure: string
  isActive: boolean
  isService: boolean
  deletedAt: Date | null
  cost: unknown
}

/** BR-SUB69-01: hanya item stok aktif yang boleh jadi asal/pengganti. */
function assertStockActiveItem(item: ItemGuardRow | null, label: string): ItemGuardRow {
  if (!item || item.deletedAt != null || !item.isActive) {
    throw new Error(`${label} tidak ditemukan atau sudah nonaktif`)
  }
  if (item.isService) {
    throw new Error(`${label} adalah jasa — substitusi hanya antar item stok`)
  }
  return item
}

async function writeSubstituteLog(args: {
  userId: number
  action:
    | "item_substitute_created"
    | "item_substitute_deactivated"
    | "work_order_item_substituted"
  modelType: "ItemSubstitute" | "WorkOrder"
  modelId: number
  description: string
  oldValues?: Record<string, string | number | boolean | null>
  newValues?: Record<string, string | number | boolean | null>
}): Promise<{ success: boolean }> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: args.userId,
        action: args.action,
        modelType: args.modelType,
        modelId: args.modelId,
        description: args.description,
        oldValues: args.oldValues ? { ...args.oldValues } : undefined,
        newValues: args.newValues ? { ...args.newValues } : undefined,
      },
    })
    return { success: true }
  } catch (logError) {
    console.error("[item-substitute] gagal menulis jejak", logError)
    return { success: false }
  }
}

// ---------------------------------------------------------------------------
// Master relasi (kelola = edit_items, lihat = view_items — Q-SUB69-1 izin master barang existing)
// ---------------------------------------------------------------------------

export async function listItemSubstitutes(itemIdInput: number) {
  try {
    await requirePermission("view_items")
    const itemId = positiveId(itemIdInput, "Barang asal")
    const rows = await prisma.itemSubstitute.findMany({
      where: { itemId },
      select: {
        id: true,
        itemId: true,
        substituteItemId: true,
        notes: true,
        isActive: true,
        createdAt: true,
        substituteItem: { select: { id: true, name: true, sku: true, unitOfMeasure: true, isActive: true } },
      },
      orderBy: [{ isActive: "desc" }, { id: "asc" }],
    })
    return {
      success: true as const,
      substitutes: rows.map((row) => ({
        id: row.id,
        itemId: row.itemId,
        substituteItemId: row.substituteItemId,
        substituteName: row.substituteItem.name,
        substituteSku: row.substituteItem.sku,
        substituteUnitOfMeasure: row.substituteItem.unitOfMeasure,
        substituteIsActive: row.substituteItem.isActive,
        notes: row.notes,
        isActive: row.isActive,
        createdAt: row.createdAt,
      })),
    }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function createItemSubstitute(input: {
  itemId: number
  substituteItemId: number
  notes?: string | null
}): Promise<Result<{ id: number }>> {
  try {
    const user = await requirePermission("edit_items")
    const itemId = positiveId(input?.itemId, "Barang asal")
    const substituteItemId = positiveId(input?.substituteItemId, "Barang pengganti")
    if (itemId === substituteItemId) {
      return { success: false, error: "Barang pengganti tidak boleh sama dengan barang asal" }
    }
    const notes = cleanText(input?.notes) || null

    const [origin, substitute] = await Promise.all([
      prisma.item.findUnique({ where: { id: itemId }, select: itemGuardSelect }),
      prisma.item.findUnique({ where: { id: substituteItemId }, select: itemGuardSelect }),
    ])
    const originItem = assertStockActiveItem(origin, "Barang asal")
    const substituteItem = assertStockActiveItem(substitute, "Barang pengganti")
    if (originItem.unitOfMeasure !== substituteItem.unitOfMeasure) {
      return {
        success: false,
        error: `Satuan dasar pengganti (${substituteItem.unitOfMeasure}) berbeda dari barang asal (${originItem.unitOfMeasure}) — substitusi lintas satuan dasar belum didukung`,
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      // Pasangan hidup (aktif ATAU nonaktif) sudah tercatat: arah yang
      // sama tidak dibuat dua kali; baris nonaktif diaktifkan lewat
      // jalur nonaktifkan/aktifkan, bukan baris baru (AC-SUB69-1).
      const existing = await tx.itemSubstitute.findUnique({
        where: { itemId_substituteItemId: { itemId, substituteItemId } },
        select: { id: true, isActive: true },
      })
      if (existing) {
        throw new Error(
          existing.isActive
            ? "Pasangan substitusi ini sudah aktif — pasangan aktif ganda ditolak"
            : "Pasangan substitusi ini sudah tercatat nonaktif — aktifkan kembali baris yang ada, jangan buat baris baru",
        )
      }
      return tx.itemSubstitute.create({
        data: { itemId, substituteItemId, notes, createdBy: Number(user.id) },
        select: { id: true },
      })
    })

    await writeSubstituteLog({
      userId: Number(user.id),
      action: "item_substitute_created",
      modelType: "ItemSubstitute",
      modelId: created.id,
      description: `Substitusi dibuat: ${originItem.sku} -> ${substituteItem.sku}`,
      newValues: { itemId, substituteItemId, notes },
    })
    revalidatePath("/master/barang")
    return { success: true, id: created.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    if (isUniqueViolation(e)) {
      return { success: false, error: "Pasangan substitusi ini sudah tercatat — pasangan ganda ditolak" }
    }
    console.error("[createItemSubstitute]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function setItemSubstituteActive(input: {
  id: number
  isActive: boolean
}): Promise<Result> {
  try {
    const user = await requirePermission("edit_items")
    const id = positiveId(input?.id, "Relasi substitusi")
    if (typeof input?.isActive !== "boolean") {
      return { success: false, error: "Status aktif tidak valid" }
    }
    const row = await prisma.itemSubstitute.findUnique({
      where: { id },
      select: { id: true, itemId: true, substituteItemId: true, isActive: true },
    })
    if (!row) return { success: false, error: "Relasi substitusi tidak ditemukan" }
    if (row.isActive === input.isActive) {
      return {
        success: false,
        error: input.isActive
          ? "Relasi substitusi ini sudah aktif"
          : "Relasi substitusi ini sudah nonaktif",
      }
    }
    // Mengaktifkan kembali menuntut penjaga yang sama seperti membuat:
    // pasangan tidak boleh hidup dua kali dan kedua item wajib stok aktif.
    if (input.isActive) {
      const [origin, substitute, activeTwin] = await Promise.all([
        prisma.item.findUnique({ where: { id: row.itemId }, select: itemGuardSelect }),
        prisma.item.findUnique({ where: { id: row.substituteItemId }, select: itemGuardSelect }),
        prisma.itemSubstitute.findFirst({
          where: { itemId: row.itemId, substituteItemId: row.substituteItemId, isActive: true, id: { not: id } },
          select: { id: true },
        }),
      ])
      assertStockActiveItem(origin, "Barang asal")
      assertStockActiveItem(substitute, "Barang pengganti")
      if (activeTwin) {
        return { success: false, error: "Pasangan substitusi ini sudah aktif — pasangan aktif ganda ditolak" }
      }
    }
    await prisma.itemSubstitute.update({ where: { id }, data: { isActive: input.isActive } })
    if (!input.isActive) {
      await writeSubstituteLog({
        userId: Number(user.id),
        action: "item_substitute_deactivated",
        modelType: "ItemSubstitute",
        modelId: id,
        description: `Substitusi #${id} dinonaktifkan (riwayat dipertahankan)`,
        oldValues: { isActive: true },
        newValues: { isActive: false },
      })
    }
    revalidatePath("/master/barang")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[setItemSubstituteActive]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ---------------------------------------------------------------------------
// Saran read-only di WO (lihat = view_work_orders — Q-SUB69-1)
// ---------------------------------------------------------------------------

export async function getSubstituteSuggestionsForWorkOrder(workOrderIdInput: number) {
  try {
    await requirePermission("view_work_orders")
    const workOrderId = positiveId(workOrderIdInput, "Perintah Kerja")
    const report = await getWorkOrderSubstituteSuggestions(workOrderId)
    if (!report) return { success: false as const, error: "Perintah Kerja tidak ditemukan" }
    return { success: true as const, ...report }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[getSubstituteSuggestionsForWorkOrder]", getErrorMessage(e) || e)
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ---------------------------------------------------------------------------
// Terapkan substitusi (kelola = edit_work_orders — Q-SUB69-1)
// ---------------------------------------------------------------------------

export async function applyWorkOrderItemSubstitute(input: {
  workOrderId: number
  workOrderItemId: number
  substituteItemId: number
  /** Default = qty baris asal (BR-SUB69-09); perubahan wajib eksplisit dari pengaju. */
  qty?: number
  /** Alasan wajib (BR-SUB69-08). */
  reason: string
}): Promise<Result<{ releaseNotice: string | null; auditWarning?: string }>> {
  try {
    const user = await requirePermission("edit_work_orders")
    const workOrderId = positiveId(input?.workOrderId, "Perintah Kerja")
    const workOrderItemId = positiveId(input?.workOrderItemId, "Baris Perintah Kerja")
    const substituteItemId = positiveId(input?.substituteItemId, "Barang pengganti")
    const reason = cleanText(input?.reason)
    if (!reason) {
      return { success: false, error: "Alasan substitusi wajib diisi" }
    }

    // Validasi ulang saat simpan (spec §6): keadaan bisa berubah antara
    // saran tampil dan simpan — relasi nonaktif di antaranya ditolak di sini.
    const line = await prisma.workOrderItem.findFirst({
      where: { id: workOrderItemId, workOrderId },
      select: { id: true, itemId: true, qty: true, status: true, description: true },
    })
    if (!line) {
      return { success: false, error: "Baris Perintah Kerja tidak ditemukan pada Perintah Kerja ini" }
    }
    if (line.status === "replaced") {
      return { success: false, error: "Baris ini sudah pernah diganti — substitusi ulang ditolak" }
    }
    if (line.itemId <= 0) {
      return { success: false, error: "Baris jasa tidak punya substitusi — hanya baris item stok" }
    }
    if (line.itemId === substituteItemId) {
      return { success: false, error: "Barang pengganti tidak boleh sama dengan barang asal baris ini" }
    }
    const qty = input?.qty == null ? Number(line.qty) : Number(input.qty)
    if (!Number.isFinite(qty) || qty <= 0) {
      return { success: false, error: "Qty pengganti wajib lebih dari 0" }
    }

    const [relation, origin, substitute, wo] = await Promise.all([
      prisma.itemSubstitute.findFirst({
        where: { itemId: line.itemId, substituteItemId, isActive: true },
        select: { id: true },
      }),
      prisma.item.findUnique({ where: { id: line.itemId }, select: itemGuardSelect }),
      prisma.item.findUnique({ where: { id: substituteItemId }, select: itemGuardSelect }),
      prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { id: true, status: true, customerVehicleId: true, bomRevisionId: true },
      }),
    ])
    if (!wo) return { success: false, error: "Perintah Kerja tidak ditemukan" }
    if (!relation) {
      return {
        success: false,
        error: "Relasi substitusi aktif untuk pasangan ini tidak ditemukan — muat ulang saran (relasi mungkin baru dinonaktifkan)",
      }
    }
    assertStockActiveItem(origin, "Barang asal")
    const substituteItem = assertStockActiveItem(substitute, "Barang pengganti")
    if (origin!.unitOfMeasure !== substituteItem.unitOfMeasure) {
      return {
        success: false,
        error: `Satuan dasar pengganti (${substituteItem.unitOfMeasure}) berbeda dari barang asal (${origin!.unitOfMeasure}) — substitusi lintas satuan dasar belum didukung`,
      }
    }

    // Q-SUB69-2: incompatible DITOLAK KERAS di server; unknown lolos
    // dengan peringatan dan wajib tercatat di ActivityLog penerapan.
    let fitment: "compatible" | "incompatible" | "unknown" = "unknown"
    let fitmentReason = "Tidak ada aturan fitment yang cocok; kompatibilitas belum diketahui."
    if (wo.customerVehicleId) {
      const configuration = await configurationFromCustomerVehicle(prisma, wo.customerVehicleId)
      if (configuration) {
        const evaluation = await evaluateFitment(prisma, {
          itemId: substituteItemId,
          bomRevisionId: wo.bomRevisionId,
          configuration,
        })
        fitment = evaluation.result
        fitmentReason = evaluation.reason
      }
    }
    if (fitment === "incompatible") {
      return {
        success: false,
        error: `Substitusi ditolak: pengganti tidak cocok untuk kendaraan perintah kerja ini. ${fitmentReason}`,
      }
    }

    // Satu-satunya jalur tulis (BR-SUB69-04): revisi item existing.
    // WO wajib in_progress, baris ter-issue ditolak, reservasi baris
    // lama dilepas, baris pengganti pending tanpa reservasi baru —
    // semua penjaga itu milik reviseWorkOrderItems, jangan duplikasi.
    const revised = await reviseWorkOrderItems({
      workOrderId,
      replacedItemIds: [workOrderItemId],
      newItems: [
        {
          itemId: substituteItemId,
          qty,
          cost: Number(substituteItem.cost),
          ...(line.description ? { description: line.description } : {}),
        },
      ],
    })
    if (!revised.success) return { success: false, error: revised.error ?? "Revisi item ditolak" }

    // Baris pengganti yang baru lahir untuk jejak berpasangan (BR-SUB69-08).
    const createdLine = await prisma.workOrderItem.findFirst({
      where: { workOrderId, itemId: substituteItemId, status: "pending" },
      orderBy: { id: "desc" },
      select: { id: true },
    })

    const logged = await writeSubstituteLog({
      userId: Number(user.id),
      action: "work_order_item_substituted",
      modelType: "WorkOrder",
      modelId: workOrderId,
      description:
        `Substitusi part perintah kerja #${workOrderId}: baris #${workOrderItemId} ` +
        `(${origin!.sku}) diganti ${substituteItem.sku} qty ${qty}. Alasan: ${reason}. ` +
        `Fitment pengganti: ${fitment}${fitment === "unknown" ? " (peringatan: kompatibilitas belum diketahui)" : ""}.`,
      oldValues: {
        workOrderItemId,
        itemId: line.itemId,
        sku: origin!.sku,
        qty: Number(line.qty),
      },
      newValues: {
        workOrderItemId: createdLine?.id ?? null,
        itemId: substituteItemId,
        sku: substituteItem.sku,
        qty,
        fitment,
        reason,
      },
    })

    return {
      success: true,
      releaseNotice: revised.releaseNotice ?? null,
      ...(!logged.success
        ? { auditWarning: "Substitusi tersimpan, tetapi jejak audit gagal ditulis — hubungi admin" }
        : {}),
    }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[applyWorkOrderItemSubstitute]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
