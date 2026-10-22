"use server"

/**
 * F-2026-10-22-088-S tahap 1: aksi master target penjualan per
 * penjual-periode + baca laporan. Spec BOT 5 + PUTUSAN BOT 1 §9A.
 *
 * Penjaga mengikat:
 * - Izin tanpa key baru (Q-TGT-2, BR-TGT-08): kelola target =
 *   approve_sales_invoices; baca laporan = view_reports (Q-TGT-3:
 *   tidak ada pandangan self-service per penjual tahap 1).
 * - Periode = tanggal bebas inklusif dua ujung (Q-TGT-4), disimpan
 *   tengah malam UTC hari kalender WIB (wibDateToUtcMidnight).
 * - Periode penjual sama tidak bertumpukan (BR-TGT-03) dijaga di
 *   DALAM tx: lock baris karyawan lalu cek tumpang tindih di tx yang
 *   sama — submit konkuren kedua ditolak. Pesan menyebut periode
 *   yang bertabrakan.
 * - targetAmount wajib > 0 (BR-TGT-04); target baru hanya karyawan
 *   isActive & belum terhapus (BR-TGT-12 — dicek server, bukan UI).
 * - Ubah target tercatat ActivityLog old/new, action
 *   sales_target_updated (BR-TGT-09, pola writeEmployeeLifecycleLog
 *   F-035/master.actions.ts): baris khusus karena logActivity existing
 *   tidak menulis oldValues/newValues. Gagal tulis jejak TIDAK
 *   menggagalkan perubahan yang sudah commit ({success:false} +
 *   console.error), dan lencana "Target diubah" diturunkan dari baris
 *   ini oleh loader.
 * - Hapus = soft-delete (deletedAt) dengan jejak (BR-TGT-10); faktur
 *   dan pencapaian tidak pernah berubah oleh operasi target.
 * - Aksi ini TIDAK PERNAH menulis invoice/pembayaran/jurnal/bonus:
 *   laporan informatif saja (BR-TGT-07).
 */

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma, TxClient } from "@/lib/db/prisma"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import {
  findOverlappingSalesTarget,
  validateSalesTargetInput,
} from "@/lib/reports/sales-target-achievement"
import { getSalesTargetAchievement } from "@/lib/reports/sales-target-achievement-data"

type Tx = TxClient

const REVALIDATE = "/laporan/target-penjualan"

export interface SalesTargetWriteInput {
  salesEmployeeId: number
  /** Tanggal kalender WIB "YYYY-MM-DD" (inklusif dua ujung). */
  periodStart: string
  periodEnd: string
  targetAmount: number
  notes?: string | null
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function parsePeriodDate(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} wajib format YYYY-MM-DD`)
  }
  const parsed = wibDateToUtcMidnight(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} wajib format YYYY-MM-DD`)
  }
  return parsed
}

function formatPeriod(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`
  return `${fmt(start)} s.d. ${fmt(end)}`
}

async function lockEmployeeRow(tx: Tx, employeeId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId} FOR UPDATE`
}

interface TargetValues {
  [key: string]: string | number | null
  salesEmployeeId: number
  periodStart: string
  periodEnd: string
  targetAmount: number
  notes: string | null
}

function toValues(t: {
  salesEmployeeId: number
  periodStart: Date
  periodEnd: Date
  targetAmount: unknown
  notes: string | null
}): TargetValues {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return {
    salesEmployeeId: t.salesEmployeeId,
    periodStart: iso(t.periodStart),
    periodEnd: iso(t.periodEnd),
    targetAmount: Number(t.targetAmount),
    notes: t.notes,
  }
}

/** Baris jejak old/new BR-TGT-09 (logActivity tidak menulis old/new). */
async function writeTargetLog(args: {
  userId: number
  action: "sales_target_created" | "sales_target_updated" | "sales_target_deleted"
  targetId: number
  description: string
  oldValues?: TargetValues
  newValues?: TargetValues
}): Promise<{ success: boolean }> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: args.userId,
        action: args.action,
        modelType: "SalesTarget",
        modelId: args.targetId,
        description: args.description,
        oldValues: args.oldValues ?? undefined,
        newValues: args.newValues ?? undefined,
      },
    })
    return { success: true }
  } catch (logError) {
    console.error("[sales-target] gagal menulis jejak target", logError)
    return { success: false }
  }
}

function normalizeInput(input: SalesTargetWriteInput) {
  const salesEmployeeId = Number(input.salesEmployeeId)
  if (!Number.isInteger(salesEmployeeId) || salesEmployeeId <= 0) {
    throw new Error("Penjual wajib dipilih")
  }
  const periodStart = parsePeriodDate(cleanText(input.periodStart), "Tanggal mulai periode")
  const periodEnd = parsePeriodDate(cleanText(input.periodEnd), "Tanggal selesai periode")
  const targetAmount = Number(input.targetAmount)
  const error = validateSalesTargetInput({ targetAmount, periodStart, periodEnd })
  if (error) throw new Error(error)
  return {
    salesEmployeeId,
    periodStart,
    periodEnd,
    targetAmount,
    notes: cleanText(input.notes) || null,
  }
}

async function assertNoOverlap(
  tx: Tx,
  salesEmployeeId: number,
  periodStart: Date,
  periodEnd: Date,
  excludeId?: number,
): Promise<void> {
  const existing = await tx.salesTarget.findMany({
    where: { salesEmployeeId, deletedAt: null },
    select: { id: true, periodStart: true, periodEnd: true },
  })
  const clash = findOverlappingSalesTarget(existing, { periodStart, periodEnd, excludeId })
  if (clash) {
    throw new Error(
      `Periode target bertumpukan dengan target ${formatPeriod(clash.periodStart, clash.periodEnd)} untuk penjual yang sama`,
    )
  }
}

export async function createSalesTarget(input: SalesTargetWriteInput) {
  try {
    const user = await requirePermission("approve_sales_invoices")
    const data = normalizeInput(input)

    const created = await prisma.$transaction(async (tx) => {
      await lockEmployeeRow(tx, data.salesEmployeeId)
      const employee = await tx.employee.findFirst({
        where: { id: data.salesEmployeeId, deletedAt: null },
        select: { id: true, isActive: true },
      })
      if (!employee) throw new Error("Karyawan penjual tidak ditemukan")
      if (!employee.isActive) {
        throw new Error("Target baru hanya untuk karyawan aktif")
      }
      await assertNoOverlap(tx, data.salesEmployeeId, data.periodStart, data.periodEnd)
      return tx.salesTarget.create({
        data: { ...data, createdBy: Number(user.id), updatedBy: Number(user.id) },
        select: {
          id: true,
          salesEmployeeId: true,
          periodStart: true,
          periodEnd: true,
          targetAmount: true,
          notes: true,
        },
      })
    })

    await writeTargetLog({
      userId: Number(user.id),
      action: "sales_target_created",
      targetId: created.id,
      description: `Membuat target penjualan ${formatPeriod(created.periodStart, created.periodEnd)}`,
      newValues: toValues(created),
    })
    revalidatePath(REVALIDATE)
    return { success: true, id: created.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createSalesTarget]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateSalesTarget(input: { id: number } & SalesTargetWriteInput) {
  try {
    const user = await requirePermission("approve_sales_invoices")
    const id = Number(input.id)
    const data = normalizeInput(input)

    const old = await prisma.$transaction(async (tx) => {
      const current = await tx.salesTarget.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          salesEmployeeId: true,
          periodStart: true,
          periodEnd: true,
          targetAmount: true,
          notes: true,
        },
      })
      if (!current) throw new Error("Target penjualan tidak ditemukan")
      // Lock penjual lama & baru (urutan id naik = anti deadlock).
      for (const employeeId of [...new Set([current.salesEmployeeId, data.salesEmployeeId])].sort(
        (a, b) => a - b,
      )) {
        await lockEmployeeRow(tx, employeeId)
      }
      if (data.salesEmployeeId !== current.salesEmployeeId) {
        const employee = await tx.employee.findFirst({
          where: { id: data.salesEmployeeId, deletedAt: null },
          select: { id: true, isActive: true },
        })
        if (!employee) throw new Error("Karyawan penjual tidak ditemukan")
        if (!employee.isActive) {
          throw new Error("Target baru hanya untuk karyawan aktif")
        }
      }
      await assertNoOverlap(tx, data.salesEmployeeId, data.periodStart, data.periodEnd, id)
      await tx.salesTarget.update({
        where: { id },
        data: { ...data, updatedBy: Number(user.id) },
      })
      return current
    })

    await writeTargetLog({
      userId: Number(user.id),
      action: "sales_target_updated",
      targetId: id,
      description: `Mengubah target penjualan ${formatPeriod(data.periodStart, data.periodEnd)}`,
      oldValues: toValues(old),
      newValues: {
        salesEmployeeId: data.salesEmployeeId,
        periodStart: data.periodStart.toISOString().slice(0, 10),
        periodEnd: data.periodEnd.toISOString().slice(0, 10),
        targetAmount: data.targetAmount,
        notes: data.notes,
      },
    })
    revalidatePath(REVALIDATE)
    return { success: true, id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateSalesTarget]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteSalesTarget(input: { id: number }) {
  try {
    const user = await requirePermission("approve_sales_invoices")
    const id = Number(input.id)

    const old = await prisma.$transaction(async (tx) => {
      const current = await tx.salesTarget.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          salesEmployeeId: true,
          periodStart: true,
          periodEnd: true,
          targetAmount: true,
          notes: true,
        },
      })
      if (!current) throw new Error("Target penjualan tidak ditemukan")
      // BR-TGT-10: selalu soft-delete dengan jejak, tidak ada hapus
      // fisik — baik periode sudah mulai maupun belum.
      await tx.salesTarget.update({
        where: { id },
        data: { deletedAt: new Date(), updatedBy: Number(user.id) },
      })
      return current
    })

    await writeTargetLog({
      userId: Number(user.id),
      action: "sales_target_deleted",
      targetId: id,
      description: `Menonaktifkan target penjualan ${formatPeriod(old.periodStart, old.periodEnd)}`,
      oldValues: toValues(old),
    })
    revalidatePath(REVALIDATE)
    return { success: true, id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteSalesTarget]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/** Baca laporan target vs pencapaian (gerbang view_reports, Q-TGT-3). */
export async function getSalesTargetAchievementReport(range: { start: Date; end: Date }) {
  await requirePermission("view_reports")
  return getSalesTargetAchievement(range)
}
