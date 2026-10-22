"use server"

/**
 * Aksi Permintaan Barang Antar Gudang — F-2026-10-22-078-S inti
 * (induk F-2026-10-21-014), spec BOT 5 §3/§4/§5 + putusan BOT 1 §8A:
 * - Q-MR-1: resource izin BARU material_requests (view/create/edit/
 *   delete + approve_material_requests terpisah dari edit).
 * - Q-MR-2: status internal sederhana (approvedBy/approvedAt/
 *   rejectionReason pola PurchaseRequest); ApprovalWorkflow generik
 *   TIDAK dipakai.
 * - Q-MR-3: self-approve DILARANG — penyetuju != pembuat, penjaga server.
 *
 * Permintaan TIDAK membuat StockMove/jurnal/MaterialIssue (BR-MR-02,
 * AC-MR-8). Satu-satunya gerak stok = InventoryTransfer tertaut yang
 * diproses/diterima lewat aksi transfer existing. PurchaseRequest
 * tidak diubah (AC-MR-10).
 */

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import {
  assertWarehouseAccess,
  assertWarehouseAccessMulti,
  getWarehouseScope,
} from "@/lib/auth/warehouse-scope"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { parseLocaleNumber } from "@/lib/utils/parse-money"
import { safeJsonParse } from "@/lib/utils/safe-parse"
import { nextSlug } from "@/lib/utils/slug-db"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { materialRequestSchema } from "@/lib/validations/inventory.schemas"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import {
  MATERIAL_REQUEST_DOCUMENT_PREFIX,
  assertItemsExistAndActive,
  assertWarehousesExistAndActive,
  assertWorkOrderLinkable,
  claimMaterialRequestTransition,
  lockMaterialRequestRow,
  requireReason,
  validateMaterialRequestItems,
  validateMaterialRequestWarehouses,
  type MaterialRequestItemWrite,
} from "@/lib/services/material-request.service"
import {
  deriveMaterialRequestFulfillment,
} from "@/lib/reports/material-request"

const REVALIDATE = "/inventaris/permintaan-gudang"

type ActionUser = { id: string; roles: string[] }

function parseRequestItems(raw: string | null | undefined): MaterialRequestItemWrite[] {
  const rows = safeJsonParse<
    { itemId: number | string; qty?: number | string; notes?: string | null }[]
  >(raw ?? null) ?? []
  const items: MaterialRequestItemWrite[] = []
  for (const row of rows) {
    const itemId = parseLocaleNumber(row?.itemId as string | number)
    if (itemId === null || itemId <= 0) continue // placeholder form
    const qty = parseLocaleNumber(row.qty as string | number)
    if (qty === null || qty <= 0) throw new Error("Kuantitas tidak valid")
    items.push({
      itemId,
      qty,
      notes: typeof row.notes === "string" && row.notes ? row.notes : null,
    })
  }
  return validateMaterialRequestItems(items)
}

async function loadRequestForAction(id: number) {
  return prisma.materialRequest.findUnique({
    where: { id },
    select: {
      id: true,
      documentNo: true,
      status: true,
      createdBy: true,
      requesterWarehouseId: true,
      sourceWarehouseId: true,
      workOrderId: true,
    },
  })
}

async function assertRequesterScope(user: ActionUser, warehouseId: number) {
  assertWarehouseAccess(await getWarehouseScope(user), warehouseId)
}

async function assertSourceScope(user: ActionUser, warehouseId: number) {
  assertWarehouseAccess(await getWarehouseScope(user), warehouseId)
}

/** AC-MR-6: lihat wajib scope tujuan ATAU sumber. */
export async function assertMaterialRequestVisible(user: ActionUser, id: number) {
  const request = await loadRequestForAction(id)
  if (!request) throw new Error("Permintaan tidak ditemukan")
  const scope = await getWarehouseScope(user)
  if (scope.kind === "all") return request
  if (scope.kind === "none") throw new Error("Anda tidak memiliki akses ke gudang mana pun.")
  if (
    !scope.warehouseIds.includes(request.requesterWarehouseId) &&
    !scope.warehouseIds.includes(request.sourceWarehouseId)
  ) {
    throw new Error("Anda tidak memiliki akses ke permintaan ini.")
  }
  return request
}

function fail(e: unknown, tag: string) {
  if (isNextRedirectError(e)) throw e
  console.error(`[${tag}]`, getErrorMessage(e) || e)
  return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
}

// ==================== CREATE / UPDATE ====================

export async function createMaterialRequest(formData: FormData) {
  try {
    const user = await requirePermission("create_material_requests")
    const parsed = parseFormData(materialRequestSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    validateMaterialRequestWarehouses(v.requesterWarehouseId, v.sourceWarehouseId)
    const items = parseRequestItems(v.items)
    await assertRequesterScope(user, v.requesterWarehouseId)

    const created = await prisma.$transaction(async (tx) => {
      await assertWarehousesExistAndActive(tx, [v.requesterWarehouseId, v.sourceWarehouseId])
      await assertItemsExistAndActive(tx, items.map((i) => i.itemId))
      if (v.workOrderId) await assertWorkOrderLinkable(tx, v.workOrderId)

      const documentNo = await generateDocumentNumber(MATERIAL_REQUEST_DOCUMENT_PREFIX)
      return tx.materialRequest.create({
        data: {
          documentNo,
          slug: await nextSlug("materialRequest", documentNo),
          requesterWarehouseId: v.requesterWarehouseId,
          sourceWarehouseId: v.sourceWarehouseId,
          workOrderId: v.workOrderId ?? null,
          neededBy: v.neededBy ? wibDateToUtcMidnight(v.neededBy) : null,
          status: "draft",
          createdBy: Number(user.id),
          items: { create: items },
        },
      })
    })

    await logActivity("create", "MaterialRequest", created.id, `Membuat permintaan antar gudang #${created.id}`)
    revalidatePath(REVALIDATE)
    return { success: true, id: created.id, slug: created.slug }
  } catch (e) {
    return fail(e, "createMaterialRequest")
  }
}

export async function updateMaterialRequest(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_material_requests")
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Permintaan tidak valid")
    const parsed = parseFormData(materialRequestSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    validateMaterialRequestWarehouses(v.requesterWarehouseId, v.sourceWarehouseId)
    const items = parseRequestItems(v.items)
    await assertRequesterScope(user, v.requesterWarehouseId)

    await prisma.$transaction(async (tx) => {
      await lockMaterialRequestRow(tx, id)
      const current = await tx.materialRequest.findUnique({
        where: { id },
        select: { status: true, requesterWarehouseId: true },
      })
      if (!current) throw new Error("Permintaan tidak ditemukan")
      if (current.status !== "draft") {
        throw new Error(`Permintaan berstatus '${current.status}' tidak dapat diubah (hanya draft)`)
      }
      assertWarehouseAccess(await getWarehouseScope(user), current.requesterWarehouseId)
      await assertWarehousesExistAndActive(tx, [v.requesterWarehouseId, v.sourceWarehouseId])
      await assertItemsExistAndActive(tx, items.map((i) => i.itemId))
      if (v.workOrderId) await assertWorkOrderLinkable(tx, v.workOrderId)

      const claim = await claimMaterialRequestTransition(tx, id, ["draft"], {
        requesterWarehouseId: v.requesterWarehouseId,
        sourceWarehouseId: v.sourceWarehouseId,
        workOrderId: v.workOrderId ?? null,
        neededBy: v.neededBy ? wibDateToUtcMidnight(v.neededBy) : null,
      })
      if (!claim) throw new Error("Permintaan sudah berubah status; muat ulang halaman")
      await tx.materialRequestItem.deleteMany({ where: { materialRequestId: id } })
      await tx.materialRequestItem.createMany({
        data: items.map((i) => ({ materialRequestId: id, itemId: i.itemId, qty: i.qty, notes: i.notes ?? null })),
      })
    })

    await logActivity("update", "MaterialRequest", id, `Mengubah permintaan antar gudang #${id}`)
    revalidatePath(REVALIDATE)
    return { success: true, id }
  } catch (e) {
    return fail(e, "updateMaterialRequest")
  }
}

export async function deleteMaterialRequest(id: number) {
  try {
    const user = await requirePermission("delete_material_requests")
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Permintaan tidak valid")
    const request = await loadRequestForAction(id)
    if (!request) throw new Error("Permintaan tidak ditemukan")
    await assertRequesterScope(user, request.requesterWarehouseId)
    if (request.status !== "draft") {
      throw new Error("Hanya permintaan draft yang dapat dihapus; batalkan permintaan yang sudah diajukan")
    }
    const claim = await prisma.materialRequest.deleteMany({ where: { id, status: "draft" } })
    if (claim.count === 0) throw new Error("Permintaan sudah berubah status; muat ulang halaman")
    await logActivity("delete", "MaterialRequest", id, `Menghapus permintaan antar gudang #${id}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "deleteMaterialRequest")
  }
}

// ==================== TRANSISI ====================

export async function submitMaterialRequest(id: number) {
  try {
    const user = await requirePermission("edit_material_requests")
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Permintaan tidak valid")
    const request = await loadRequestForAction(id)
    if (!request) throw new Error("Permintaan tidak ditemukan")
    await assertRequesterScope(user, request.requesterWarehouseId)

    await prisma.$transaction(async (tx) => {
      const items = await tx.materialRequestItem.findMany({
        where: { materialRequestId: id },
        select: { itemId: true },
      })
      if (items.length === 0) throw new Error("Permintaan wajib memiliki minimal satu baris item")
      const claim = await claimMaterialRequestTransition(tx, id, ["draft"], { status: "diajukan" })
      if (!claim) throw new Error("Permintaan hanya dapat diajukan dari status draft")
    })

    await logActivity("submit", "MaterialRequest", id, `Mengajukan permintaan antar gudang #${id}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "submitMaterialRequest")
  }
}

export async function approveMaterialRequest(id: number) {
  try {
    const user = await requirePermission("approve_material_requests")
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Permintaan tidak valid")
    const request = await loadRequestForAction(id)
    if (!request) throw new Error("Permintaan tidak ditemukan")
    // AC-MR-7: persetujuan dari scope gudang SUMBER.
    await assertSourceScope(user, request.sourceWarehouseId)
    // Q-MR-3: self-approve dilarang.
    if (request.createdBy !== null && Number(request.createdBy) === Number(user.id)) {
      throw new Error("Penyetuju tidak boleh menyetujui permintaan yang dibuat sendiri")
    }

    const claim = await prisma.materialRequest.updateMany({
      where: { id, status: "diajukan" },
      data: { status: "disetujui", approvedBy: Number(user.id), approvedAt: new Date(), rejectionReason: null },
    })
    if (claim.count === 0) throw new Error("Permintaan hanya dapat disetujui dari status diajukan")

    await logActivity("approve", "MaterialRequest", id, `Menyetujui permintaan antar gudang #${id}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "approveMaterialRequest")
  }
}

export async function rejectMaterialRequest(id: number, reason: string) {
  try {
    const user = await requirePermission("approve_material_requests")
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Permintaan tidak valid")
    const cleanReason = requireReason(reason, "penolakan")
    const request = await loadRequestForAction(id)
    if (!request) throw new Error("Permintaan tidak ditemukan")
    await assertSourceScope(user, request.sourceWarehouseId)

    const claim = await prisma.materialRequest.updateMany({
      where: { id, status: "diajukan" },
      data: { status: "ditolak", rejectionReason: cleanReason },
    })
    if (claim.count === 0) throw new Error("Permintaan hanya dapat ditolak dari status diajukan")

    await logActivity("reject", "MaterialRequest", id, `Menolak permintaan antar gudang #${id}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "rejectMaterialRequest")
  }
}

export async function cancelMaterialRequest(id: number, reason: string) {
  try {
    const user = await requirePermission("edit_material_requests")
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Permintaan tidak valid")
    const cleanReason = requireReason(reason, "pembatalan")
    const request = await loadRequestForAction(id)
    if (!request) throw new Error("Permintaan tidak ditemukan")
    await assertRequesterScope(user, request.requesterWarehouseId)

    await prisma.$transaction(async (tx) => {
      await lockMaterialRequestRow(tx, id)
      const current = await tx.materialRequest.findUnique({
        where: { id },
        select: { status: true, _count: { select: { transfers: true } } },
      })
      if (!current) throw new Error("Permintaan tidak ditemukan")
      // BR-MR-05: disetujui ber-transfer tidak bisa dibatalkan.
      if (current._count.transfers > 0) {
        throw new Error("Permintaan yang sudah memiliki transfer tidak dapat dibatalkan; tutup sisa permintaan")
      }
      const claim = await claimMaterialRequestTransition(tx, id, ["draft", "diajukan"], {
        status: "dibatalkan",
        rejectionReason: cleanReason,
      })
      if (!claim) throw new Error(`Permintaan berstatus '${current.status}' tidak dapat dibatalkan`)
    })

    await logActivity("cancel", "MaterialRequest", id, `Membatalkan permintaan antar gudang #${id}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "cancelMaterialRequest")
  }
}

export async function closeMaterialRequest(id: number, reason: string) {
  try {
    const user = await requirePermission("approve_material_requests")
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Permintaan tidak valid")
    const cleanReason = requireReason(reason, "penutupan")
    const request = await loadRequestForAction(id)
    if (!request) throw new Error("Permintaan tidak ditemukan")
    await assertSourceScope(user, request.sourceWarehouseId)

    const claim = await prisma.materialRequest.updateMany({
      where: { id, status: { in: ["disetujui", "terpenuhi_sebagian"] } },
      data: { status: "ditutup_manual", rejectionReason: cleanReason },
    })
    if (claim.count === 0) {
      throw new Error("Hanya permintaan disetujui/terpenuhi sebagian yang dapat ditutup manual")
    }

    await logActivity("close", "MaterialRequest", id, `Menutup sisa permintaan antar gudang #${id}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "closeMaterialRequest")
  }
}

// ==================== BUAT TRANSFER ====================

/**
 * AC-MR-2: transfer lahir HANYA dari disetujui/terpenuhi_sebagian.
 * Qty transfer = SISA per baris (diminta - diterima dari transfer
 * received tertaut); transfer draft sebelumnya tidak mengurangi sisa
 * (BR-MR-04: ukuran = diterima). Gudang dari permintaan, bukan klien.
 */
export async function createTransferFromMaterialRequest(id: number, formData?: FormData) {
  try {
    const user = await requirePermission("create_inventory_transfers")
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Permintaan tidak valid")
    const dateRaw = formData?.get("date")
    const notesRaw = formData?.get("notes")

    const created = await prisma.$transaction(async (tx) => {
      await lockMaterialRequestRow(tx, id)
      const request = await tx.materialRequest.findUnique({
        where: { id },
        select: {
          id: true,
          documentNo: true,
          status: true,
          requesterWarehouseId: true,
          sourceWarehouseId: true,
          items: { select: { itemId: true, qty: true } },
        },
      })
      if (!request) throw new Error("Permintaan tidak ditemukan")
      if (request.status !== "disetujui" && request.status !== "terpenuhi_sebagian") {
        throw new Error(
          `Transfer hanya dapat dibuat dari permintaan disetujui (status saat ini: '${request.status}')`,
        )
      }
      const scope = await getWarehouseScope(user)
      // Scope KEDUA gudang dokumen (patokan inventory_transfer existing).
      assertWarehouseAccessMulti(scope, [request.sourceWarehouseId, request.requesterWarehouseId])
      await assertWarehousesExistAndActive(tx, [request.sourceWarehouseId, request.requesterWarehouseId])

      const receivedTransfers = await tx.inventoryTransfer.findMany({
        where: { materialRequestId: id, status: "received" },
        select: { items: { select: { itemId: true, qty: true } } },
      })
      const { lines } = deriveMaterialRequestFulfillment({
        requested: request.items.map((i) => ({ itemId: i.itemId, qty: Number(i.qty) })),
        receivedLines: receivedTransfers.flatMap((t) =>
          t.items.map((i) => ({ itemId: i.itemId, qty: Number(i.qty) })),
        ),
      })
      const remaining = lines.filter((l) => l.remainingQty > 0.0001)
      if (remaining.length === 0) throw new Error("Semua baris permintaan sudah terpenuhi")

      const documentNo = await generateDocumentNumber("TRF")
      const dateStr = typeof dateRaw === "string" && dateRaw ? dateRaw : null
      const transfer = await tx.inventoryTransfer.create({
        data: {
          documentNo,
          slug: await nextSlug("inventoryTransfer", documentNo),
          sourceWarehouseId: request.sourceWarehouseId,
          destinationWarehouseId: request.requesterWarehouseId,
          materialRequestId: id,
          date: dateStr ? wibDateToUtcMidnight(dateStr) : new Date(),
          notes: typeof notesRaw === "string" && notesRaw ? notesRaw : `Dari ${request.documentNo}`,
          status: "draft",
          createdBy: Number(user.id),
          items: {
            create: remaining.map((l) => ({ itemId: l.itemId, qty: l.remainingQty })),
          },
        },
      })
      return transfer
    })

    await logActivity(
      "create",
      "InventoryTransfer",
      created.id,
      `Membuat transfer inventaris #${created.id} dari permintaan antar gudang #${id}`,
    )
    revalidatePath(REVALIDATE)
    revalidatePath("/inventaris/transfer")
    return { success: true, id: created.id, slug: created.slug }
  } catch (e) {
    return fail(e, "createTransferFromMaterialRequest")
  }
}

