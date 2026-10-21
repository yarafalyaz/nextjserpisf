"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { safeSubtract } from "@/lib/utils/math"
import {
  createProductionCostSchema,
  updateProductionCostSchema,
  applyOverheadSchema,
  OVERHEAD_DRIVER_LABELS,
} from "@/lib/validations/production-cost.schemas"
import { applyProductionCostDelta } from "@/lib/services/production-cost.service"
import { closedWorkOrderError } from "@/lib/services/timesheet-context"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { safeMultiply, safeRound } from "@/lib/utils/math"

/** Production orders keep their cost locked once completed/cancelled. */
function mutableOrderError(
  order: { status: string } | null,
  verb: "ditambahkan" | "diubah" | "dihapus",
): { success: false; error: string } | null {
  if (!order) return { success: false, error: "Perintah produksi tidak ditemukan" }
  if (order.status === "completed" || order.status === "cancelled") {
    return {
      success: false,
      error: `Biaya tidak dapat ${verb} pada perintah berstatus '${order.status}'.`,
    }
  }
  return null
}

/**
 * Add a non-material cost line (labor/machine/overhead/subcontract/service) to a
 * production order and roll its amount into the order's actual cost (PRD
 * FAB-06/07/08/09). At least one of productionOrderId/workOrderId must be set;
 * only a production order participates in the HPP rollup.
 */
export async function createProductionCost(formData: FormData) {
  try {
    const user = await requirePermission("manage_production_costs")
    await assertPeriodOpen(new Date())

    const parsed = parseFormData(createProductionCostSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    if (!v.productionOrderId && !v.workOrderId) {
      return { success: false, error: "Pilih perintah produksi atau perintah kerja." }
    }

    // A labor line may carry hours × rate; if amount not supplied but both are,
    // derive it. Otherwise amount is required (validated by schema).
    const amount = v.amount ?? 0

    if (v.productionOrderId) {
      const order = await prisma.productionOrder.findUnique({
        where: { id: v.productionOrderId },
        select: { id: true, status: true, documentNo: true },
      })
      const invalid = mutableOrderError(order, "ditambahkan")
      if (invalid) return invalid
    }
    if (v.workOrderId) {
      const wo = await prisma.workOrder.findUnique({
        where: { id: v.workOrderId },
        select: { id: true },
      })
      if (!wo) return { success: false, error: "Perintah kerja tidak ditemukan" }
    }
    if (v.vendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { id: v.vendorId }, select: { id: true } })
      if (!vendor) return { success: false, error: "Vendor tidak ditemukan" }
    }

    const cost = await prisma.$transaction(async (tx) => {
      const created = await tx.productionCost.create({
        data: {
          productionOrderId: v.productionOrderId ?? null,
          workOrderId: v.workOrderId ?? null,
          category: v.category,
          description: v.description ?? null,
          hours: v.hours ?? null,
          rate: v.rate ?? null,
          amount,
          vendorId: v.vendorId ?? null,
          referenceNo: v.referenceNo ?? null,
          postedAt: new Date(),
          createdBy: Number(user.id),
        },
      })
      // Only production orders roll into HPP.
      if (v.productionOrderId) {
        await applyProductionCostDelta(v.productionOrderId, amount, tx, {
          userId: Number(user.id),
          costLineId: created.id,
        })
      }
      return created
    })

    await logActivity(
      "create",
      "ProductionCost",
      cost.id,
      `Menambah biaya ${v.category} Rp${amount} ke ${v.productionOrderId ? `perintah produksi #${v.productionOrderId}` : `perintah kerja #${v.workOrderId}`}`,
    )
    revalidatePath("/produksi/production-orders")
    if (v.productionOrderId) revalidatePath(`/produksi/production-orders/${v.productionOrderId}`)
    return { success: true, id: cost.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createProductionCost]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Edit a cost line. Applies the delta (new − old) to the production order's
 * actual cost so the rollup stays exact.
 */
export async function updateProductionCost(id: number, formData: FormData) {
  try {
    const user = await requirePermission("manage_production_costs")
    await assertPeriodOpen(new Date())

    const parsed = parseFormData(updateProductionCostSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const existing = await prisma.productionCost.findUnique({
      where: { id },
      select: { id: true, productionOrderId: true, amount: true },
    })
    if (!existing) return { success: false, error: "Biaya tidak ditemukan" }

    if (v.vendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { id: v.vendorId }, select: { id: true } })
      if (!vendor) return { success: false, error: "Vendor tidak ditemukan" }
    }

    if (existing.productionOrderId) {
      const order = await prisma.productionOrder.findUnique({
        where: { id: existing.productionOrderId },
        select: { id: true, status: true },
      })
      const invalid = mutableOrderError(order, "diubah")
      if (invalid) return invalid
    }

    await prisma.$transaction(async (tx) => {
      await tx.productionCost.update({
        where: { id },
        data: {
          category: v.category,
          description: v.description ?? null,
          hours: v.hours ?? null,
          rate: v.rate ?? null,
          amount: v.amount,
          vendorId: v.vendorId ?? null,
          referenceNo: v.referenceNo ?? null,
        },
      })
      if (existing.productionOrderId) {
        const delta = safeSubtract(v.amount, Number(existing.amount), 2)
        await applyProductionCostDelta(existing.productionOrderId, delta, tx, {
          userId: Number(user.id),
          costLineId: id,
        })
      }
    })

    await logActivity("update", "ProductionCost", id, `Memperbarui biaya produksi #${id}`)
    revalidatePath("/produksi/production-orders")
    if (existing.productionOrderId) revalidatePath(`/produksi/production-orders/${existing.productionOrderId}`)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateProductionCost]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/** Remove a cost line and subtract its amount from the production order total. */
export async function deleteProductionCost(id: number) {
  try {
    const user = await requirePermission("manage_production_costs")
    await assertPeriodOpen(new Date())

    const existing = await prisma.productionCost.findUnique({
      where: { id },
      select: { id: true, productionOrderId: true, amount: true },
    })
    if (!existing) return { success: false, error: "Biaya tidak ditemukan" }

    if (existing.productionOrderId) {
      const order = await prisma.productionOrder.findUnique({
        where: { id: existing.productionOrderId },
        select: { id: true, status: true },
      })
      const invalid = mutableOrderError(order, "dihapus")
      if (invalid) return invalid
    }

    await prisma.$transaction(async (tx) => {
      await tx.productionCost.delete({ where: { id } })
      if (existing.productionOrderId) {
        await applyProductionCostDelta(existing.productionOrderId, -Number(existing.amount), tx, {
          userId: Number(user.id),
          costLineId: id,
        })
      }
    })

    await logActivity("delete", "ProductionCost", id, `Menghapus biaya produksi #${id}`)
    revalidatePath("/produksi/production-orders")
    if (existing.productionOrderId) revalidatePath(`/produksi/production-orders/${existing.productionOrderId}`)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteProductionCost]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Pull labor cost from approved timesheets of the project linked to a work
 * order. Creates one `labor` cost line per timesheet (with hours + a snapshot
 * rate), skipping any timesheet already mapped to an existing cost line. This
 * is the "tarik dari timesheet" path of FAB-06; the amount is snapshotted so a
 * later rate change does not silently restate an already-posted HPP.
 *
 * `ratePerHour` is supplied by the caller (a costing rate snapshot) — the
 * system does not read payroll data here.
 */
export async function pullLaborCostFromTimesheets(
  workOrderId: number,
  productionOrderId: number,
  ratePerHour: number,
) {
  try {
    const user = await requirePermission("manage_production_costs")
    await assertPeriodOpen(new Date())
    if (!Number.isFinite(ratePerHour) || ratePerHour <= 0) {
      return { success: false, error: "Tarif per jam tidak valid." }
    }

    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, projectId: true },
    })
    if (!wo) return { success: false, error: "Perintah kerja tidak ditemukan" }
    if (!wo.projectId) {
      return { success: false, error: "Perintah kerja belum tertaut ke proyek; tidak ada timesheet untuk ditarik." }
    }
    const order = await prisma.productionOrder.findUnique({
      where: { id: productionOrderId },
      select: { id: true, status: true, workOrderId: true },
    })
    const invalid = mutableOrderError(order, "ditambahkan")
    if (invalid) return invalid
    if (order && order.workOrderId != null && order.workOrderId !== workOrderId) {
      return {
        success: false,
        error: "Perintah produksi tidak termasuk dalam perintah kerja ini.",
      }
    }

    const timesheets = await prisma.timesheet.findMany({
      where: { projectId: wo.projectId },
      select: { id: true, hours: true, date: true, description: true },
      orderBy: { date: "asc" },
    })
    if (timesheets.length === 0) {
      return { success: false, error: "Tidak ada timesheet pada proyek ini." }
    }

    // Anti-dobel GLOBAL (F-2026-10-21-019): satu timesheet tidak pernah
    // menjadi dua ProductionCost, lintas jalur proyek/PO maupun jalur WO.
    const alreadyPulled = await prisma.productionCost.findMany({
      where: { sourceTimesheetId: { in: timesheets.map((t) => t.id) } },
      select: { sourceTimesheetId: true },
    })
    const pulledSet = new Set(alreadyPulled.map((c) => c.sourceTimesheetId))

    const toCreate = timesheets.filter((t) => !pulledSet.has(t.id))
    if (toCreate.length === 0) {
      return { success: false, error: "Semua timesheet proyek ini sudah ditarik ke biaya produksi." }
    }

    let totalAdded = 0
    await prisma.$transaction(async (tx) => {
      for (const t of toCreate) {
        const hours = Number(t.hours)
        const amount = Math.round(hours * ratePerHour * 100) / 100
        if (amount <= 0) continue
        await tx.productionCost.create({
          data: {
            productionOrderId,
            workOrderId,
            category: "labor",
            description: t.description ?? `Tenaga kerja timesheet #${t.id}`,
            hours,
            rate: ratePerHour,
            amount,
            sourceTimesheetId: t.id,
            postedAt: new Date(),
            createdBy: Number(user.id),
          },
        })
        totalAdded = Math.round((totalAdded + amount) * 100) / 100
      }
      if (totalAdded > 0) {
        await applyProductionCostDelta(productionOrderId, totalAdded, tx, { userId: Number(user.id) })
      }
    })

    await logActivity("create", "ProductionCost", productionOrderId,
      `Menarik ${toCreate.length} timesheet → biaya tenaga kerja Rp${totalAdded} ke perintah produksi #${productionOrderId}`,
    )
    revalidatePath(`/produksi/production-orders/${productionOrderId}`)
    return { success: true, added: totalAdded, count: toCreate.length }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[pullLaborCostFromTimesheets]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * F-2026-10-21-019 (jalur W): pull labor langsung dari timesheet konteks
 * perintah kerja (workOrderId pada Timesheet) ke ProductionCost WO, TANPA
 * ProductionOrder — menutup lubang WO non-proyek yang jalur proyek di atas
 * tolak. Manual per WO (bukan otomatis saat WO completed), tarif snapshot
 * dari pemanggil (sistem tidak membaca payroll di sini), idempoten GLOBAL
 * per sourceTimesheetId: tarikan kedua menghasilkan 0 baris baru. Tanpa
 * rollup PO dan tanpa jurnal baru — aktual WO terbaca dari
 * ProductionCost.workOrderId oleh laporan beban WO existing.
 */
export async function pullLaborCostFromWorkOrderTimesheets(
  workOrderId: number,
  ratePerHour: number,
) {
  try {
    const user = await requirePermission("manage_production_costs")
    await assertPeriodOpen(new Date())
    if (!Number.isFinite(ratePerHour) || ratePerHour <= 0) {
      return { success: false, error: "Tarif per jam tidak valid." }
    }

    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, status: true },
    })
    if (!wo) return { success: false, error: "Perintah kerja tidak ditemukan" }
    const closed = closedWorkOrderError(wo.status, "ditarik")
    if (closed) return { success: false, error: closed }

    const timesheets = await prisma.timesheet.findMany({
      where: { workOrderId },
      select: { id: true, hours: true, date: true, description: true },
      orderBy: { date: "asc" },
    })
    if (timesheets.length === 0) {
      return { success: false, error: "Tidak ada timesheet pada perintah kerja ini." }
    }

    let totalAdded = 0
    let createdCount = 0
    await prisma.$transaction(async (tx) => {
      // Dibaca ulang di dalam transaksi: semesta idempoten per-timesheet
      // global (lintas jalur proyek/WO), bukan per perintah.
      const alreadyPulled = await tx.productionCost.findMany({
        where: { sourceTimesheetId: { in: timesheets.map((t) => t.id) } },
        select: { sourceTimesheetId: true },
      })
      const pulledSet = new Set(alreadyPulled.map((c) => c.sourceTimesheetId))
      for (const t of timesheets) {
        if (pulledSet.has(t.id)) continue
        const hours = Number(t.hours)
        const amount = safeRound(safeMultiply(hours, ratePerHour, 0), 2)
        if (amount <= 0) continue
        await tx.productionCost.create({
          data: {
            productionOrderId: null,
            workOrderId,
            category: "labor",
            description: t.description ?? `Tenaga kerja timesheet #${t.id}`,
            hours,
            rate: ratePerHour,
            amount,
            sourceTimesheetId: t.id,
            postedAt: new Date(),
            createdBy: Number(user.id),
          },
        })
        createdCount += 1
        totalAdded = safeRound(totalAdded + amount, 2)
      }
    })

    if (createdCount > 0) {
      await logActivity("create", "ProductionCost", workOrderId,
        `Menarik ${createdCount} timesheet perintah kerja → biaya tenaga kerja Rp${totalAdded} ke perintah kerja #${workOrderId}`,
      )
      revalidatePath(`/produksi/perintah-kerja/${workOrderId}`)
    }
    return { success: true, added: totalAdded, count: createdCount }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[pullLaborCostFromWorkOrderTimesheets]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Apply overhead to a production order using an auditable driver (PRD FAB-07).
 * Applied overhead = driver qty × rate (jam mesin/jam tenaga kerja/kuantitas/SKF).
 * Creates a `ProductionCost` line tagged `isAppliedOverhead` + `driverType` so the
 * under/over-absorption report can isolate system-applied overhead, then rolls the
 * amount into the order's HPP via the shared delta mechanism.
 */
export async function applyOverheadToProductionOrder(formData: FormData) {
  try {
    const user = await requirePermission("manage_production_costs")
    await assertPeriodOpen(new Date())

    const parsed = parseFormData(applyOverheadSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const amount = safeRound(safeMultiply(v.driverQty, v.rate, 0), 2)
    if (amount <= 0) {
      return { success: false, error: "Nilai overhead harus lebih dari 0 (kuantitas driver × tarif)." }
    }

    const order = await prisma.productionOrder.findUnique({
      where: { id: v.productionOrderId },
      select: { id: true, status: true, documentNo: true },
    })
    if (!order) return { success: false, error: "Perintah produksi tidak ditemukan" }
    if (order.status === "completed" || order.status === "cancelled") {
      return { success: false, error: `Overhead tidak dapat diterapkan ke perintah berstatus '${order.status}'.` }
    }

    const driverLabel = OVERHEAD_DRIVER_LABELS[v.driverType]

    const cost = await prisma.$transaction(async (tx) => {
      const created = await tx.productionCost.create({
        data: {
          productionOrderId: v.productionOrderId,
          category: "overhead",
          description: v.description ?? `Overhead applied — ${driverLabel} (${v.driverQty} × ${v.rate})`,
          hours: v.driverQty,
          rate: v.rate,
          amount,
          driverType: v.driverType,
          isAppliedOverhead: true,
          postedAt: new Date(),
          createdBy: Number(user.id),
        },
      })
      await applyProductionCostDelta(v.productionOrderId, amount, tx, {
        userId: Number(user.id),
        costLineId: created.id,
      })
      return created
    })

    await logActivity("create", "ProductionCost", cost.id,
      `Menerapkan overhead applied Rp${amount} (${driverLabel} ${v.driverQty} × ${v.rate}) ke perintah produksi #${v.productionOrderId}`,
    )
    revalidatePath("/produksi/production-orders")
    revalidatePath(`/produksi/production-orders/${v.productionOrderId}`)
    return { success: true, id: cost.id, amount }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[applyOverheadToProductionOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
