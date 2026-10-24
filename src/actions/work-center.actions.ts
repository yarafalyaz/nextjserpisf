"use server"

/**
 * Aksi master stasiun kerja + penetapan stasiun tahap WO
 * (F-2026-10-22-090-S, putusan BOT 1 §9A).
 *
 * Izin (Q-LP-2): semua aksi di sini penjaga `edit_work_orders` — tanpa key
 * katalog baru. Lihat papan digerbang `view_work_orders` di halaman pemanggil
 * loader `getWorkCenterLoadPlan`.
 *
 * Nama stasiun unik hanya di antara stasiun AKTIF (Q-LP-5 fisik BOT 3):
 * `normalizedName` trim+lowercase dicek di transaksi yang sama dengan tulis
 * (pola PayrollComponent); nama sama dengan stasiun nonaktif boleh. Stasiun
 * yang dirujuk tahap tidak bisa dihapus (FK Restrict di schema) — permukaan
 * hapus memang tidak disediakan, hanya nonaktifkan (BR-LP-06).
 *
 * Penetapan stasiun tahap tidak mengubah status tahap, estimatedHours, atau
 * endDate WO, dan tidak memblokir start WO (BR-LP-05).
 */

import { prisma, type TxClient } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { workCenterSchema } from "@/lib/validations/manufacturing.schemas"
import {
  evaluateWorkCenterNameAvailability,
  normalizeWorkCenterName,
} from "@/lib/reports/work-center-load-plan"
import { revalidatePath } from "next/cache"

const WORK_ORDER_PATH = "/produksi/perintah-kerja"

async function assertActiveWorkCenterNameAvailable(
  tx: TxClient,
  name: string,
  excludeId?: number,
): Promise<string> {
  const existing = await tx.workCenter.findMany({
    where: { normalizedName: normalizeWorkCenterName(name), isActive: true },
    select: { id: true, normalizedName: true, isActive: true },
  })
  const verdict = evaluateWorkCenterNameAvailability({
    existing,
    name,
    excludeId: excludeId ?? null,
  })
  if (!verdict.ok) throw new Error(verdict.error)
  return verdict.normalizedName
}

export async function createWorkCenter(formData: FormData) {
  try {
    const user = await requirePermission("edit_work_orders")
    const parsed = parseFormData(workCenterSchema, formData)
    if (!parsed.success) return { success: false as const, error: parsed.error }
    const v = parsed.data

    const created = await prisma.$transaction(async (tx) => {
      const normalizedName = await assertActiveWorkCenterNameAvailable(tx, v.name)
      return tx.workCenter.create({
        data: {
          name: v.name,
          normalizedName,
          capacityHoursPerDay: v.capacityHoursPerDay,
          parallelStations: v.parallelStations,
          sortOrder: v.sortOrder ?? 0,
          isActive: v.isActive ?? true,
          createdBy: Number(user.id),
          updatedBy: Number(user.id),
        },
      })
    })

    await logActivity("create", "WorkCenter", created.id, `Menambah stasiun kerja ${v.name}`)
    revalidatePath(WORK_ORDER_PATH)
    return { success: true as const, id: created.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createWorkCenter]", getErrorMessage(e) || e)
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateWorkCenter(id: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_work_orders")
    const parsed = parseFormData(workCenterSchema, formData)
    if (!parsed.success) return { success: false as const, error: parsed.error }
    const v = parsed.data

    await prisma.$transaction(async (tx) => {
      const existing = await tx.workCenter.findUniqueOrThrow({
        where: { id },
        select: { id: true, isActive: true },
      })
      const nextActive = v.isActive ?? existing.isActive
      // Nama hanya wajib unik bila stasiun hasil ubah berstatus aktif;
      // mengaktifkan kembali stasiun ikut dicek (AC-LP-8).
      const normalizedName = nextActive
        ? await assertActiveWorkCenterNameAvailable(tx, v.name, id)
        : normalizeWorkCenterName(v.name)
      await tx.workCenter.update({
        where: { id },
        data: {
          name: v.name,
          normalizedName,
          capacityHoursPerDay: v.capacityHoursPerDay,
          parallelStations: v.parallelStations,
          sortOrder: v.sortOrder ?? 0,
          isActive: nextActive,
          updatedBy: Number(user.id),
        },
      })
    })

    await logActivity("update", "WorkCenter", id, `Memperbarui stasiun kerja ${v.name}`)
    revalidatePath(WORK_ORDER_PATH)
    return { success: true as const }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateWorkCenter]", getErrorMessage(e) || e)
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deactivateWorkCenter(id: number) {
  try {
    const user = await requirePermission("edit_work_orders")
    const center = await prisma.workCenter.update({
      where: { id },
      data: { isActive: false, updatedBy: Number(user.id) },
    })
    await logActivity(
      "update",
      "WorkCenter",
      id,
      `Menonaktifkan stasiun kerja ${center.name}`,
    )
    revalidatePath(WORK_ORDER_PATH)
    return { success: true as const }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deactivateWorkCenter]", getErrorMessage(e) || e)
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Tetapkan (atau kosongkan, workCenterId null) stasiun satu tahap WO.
 * Stasiun tujuan wajib aktif — stasiun nonaktif tertutup untuk penetapan
 * baru, tahap lama yang sudah menunjuknya tetap terbaca (BR-LP-06/AC-LP-7).
 */
export async function setWorkOrderOperationWorkCenter(
  workOrderId: number,
  operationId: number,
  workCenterId: number | null,
) {
  try {
    await requirePermission("edit_work_orders")

    await prisma.$transaction(async (tx) => {
      const operation = await tx.workOrderOperation.findUniqueOrThrow({
        where: { id: operationId },
        select: { id: true, workOrderId: true },
      })
      if (operation.workOrderId !== workOrderId) {
        throw new Error("Tahap tidak ditemukan pada perintah kerja ini.")
      }
      if (workCenterId != null) {
        const center = await tx.workCenter.findUnique({
          where: { id: workCenterId },
          select: { id: true, isActive: true },
        })
        if (!center) throw new Error("Stasiun kerja tidak ditemukan")
        if (!center.isActive) {
          throw new Error("Stasiun kerja nonaktif tidak dapat dipilih untuk tahap baru")
        }
      }
      await tx.workOrderOperation.update({
        where: { id: operationId },
        data: { workCenterId },
      })
    })

    await logActivity(
      "update",
      "WorkOrderOperation",
      operationId,
      workCenterId == null
        ? "Mengosongkan stasiun tahap perintah kerja"
        : "Menetapkan stasiun tahap perintah kerja",
    )
    revalidatePath(WORK_ORDER_PATH)
    return { success: true as const }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[setWorkOrderOperationWorkCenter]", getErrorMessage(e) || e)
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
