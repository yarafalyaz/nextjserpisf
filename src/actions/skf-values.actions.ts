"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage } from "@/lib/utils/error"

// ─────────────────────────────────────────────────────────────────────────────
// List SKF Values with filters
// ─────────────────────────────────────────────────────────────────────────────
export async function getSkfValues(params: {
  skfId?: number
  period?: string
  costCenterId?: number
}) {
  try {
    await requirePermission("view_statistical_key_figures")

    const where: Record<string, unknown> = {}
    if (params.skfId) where.statisticalKeyFigureId = params.skfId
    if (params.period) where.period = params.period
    if (params.costCenterId) where.costCenterId = params.costCenterId

    const values = await prisma.skfValue.findMany({
      where,
      include: {
        statisticalKeyFigure: { select: { id: true, name: true, code: true, unit: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ period: "desc" }, { costCenterId: "asc" }],
    })

    return { success: true, data: values.map((v) => ({ ...v, value: Number(v.value) })) }
  } catch (e: unknown) {
    console.error("[getSkfValues]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan"), data: [] }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk upsert SKF values (matrix entry)
// ─────────────────────────────────────────────────────────────────────────────
export async function upsertBulkSkfValues(
  skfId: number,
  period: string,
  values: { costCenterId: number | null; value: number }[],
) {
  try {
    await requirePermission("edit_statistical_key_figures")

    // Validate period format (YYYY-MM) and month range.
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return { success: false, error: "Format periode harus YYYY-MM" }
    }

    if (!Number.isSafeInteger(skfId) || skfId < 1) {
      return { success: false, error: "Angka kunci statistik tidak valid" }
    }
    if (!Array.isArray(values) || values.some((entry) =>
      !entry ||
      (entry.costCenterId !== null && (!Number.isSafeInteger(entry.costCenterId) || entry.costCenterId < 1)) ||
      !Number.isFinite(entry.value) ||
      entry.value < 0
    )) {
      return { success: false, error: "Nilai atau pusat biaya tidak valid" }
    }

    await prisma.$transaction(async (tx) => {
      // Serialize writes for this SKF. MySQL unique indexes allow multiple
      // NULL values, so the nullable costCenterId cannot provide an upsert
      // conflict target on its own.
      const existingSkf = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM statistical_key_figures WHERE id = ${skfId} FOR UPDATE
      `
      if (existingSkf.length === 0) throw new Error("Angka kunci statistik tidak ditemukan")

      for (const entry of values) {
        const existing = await tx.skfValue.findFirst({
          where: {
            statisticalKeyFigureId: skfId,
            period,
            costCenterId: entry.costCenterId,
            profitCenterId: null,
          },
          select: { id: true },
        })

        if (existing) {
          await tx.skfValue.update({ where: { id: existing.id }, data: { value: entry.value } })
        } else {
          await tx.skfValue.create({
            data: {
              statisticalKeyFigureId: skfId,
              period,
              costCenterId: entry.costCenterId,
              value: entry.value,
            },
          })
        }
      }
    })

    revalidatePath("/keuangan/angka-kunci-statistik/nilai")
    await logActivity("update", "SkfValue", skfId, `Memperbarui nilai SKF periode ${period}`)
    return { success: true }
  } catch (e: unknown) {
    console.error("[upsertBulkSkfValues]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete a single SKF value
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteSkfValue(id: number) {
  try {
    await requirePermission("delete_statistical_key_figures")
    await prisma.skfValue.delete({ where: { id } })
    revalidatePath("/keuangan/angka-kunci-statistik/nilai")
    await logActivity("delete", "SkfValue", id, "Menghapus nilai SKF")
    return { success: true }
  } catch (e: unknown) {
    console.error("[deleteSkfValue]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get distinct periods from existing SKF values
// ─────────────────────────────────────────────────────────────────────────────
export async function getSkfPeriods() {
  try {
    await requirePermission("view_statistical_key_figures")
    const periods = await prisma.skfValue.findMany({
      select: { period: true },
      distinct: ["period"],
      orderBy: { period: "desc" },
    })
    return { success: true, data: periods.map((p) => p.period) }
  } catch (e: unknown) {
    console.error("[getSkfPeriods]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan"), data: [] }
  }
}
