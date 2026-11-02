"use server"

import { Prisma } from "@prisma/client"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma, type TxClient } from "@/lib/db/prisma"
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
import { assertJobCostMutable } from "@/lib/services/job-closeout.service"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { checkIdempotency } from "@/lib/utils/idempotency"
import { safeMultiply, safeRound } from "@/lib/utils/math"

/**
 * Putaran 50: baris WO-only dulu hanya dicek ada — WO completed/cancelled
 * tetap bisa ditambah/diubah/dihapus biayanya, asimetris terhadap baris
 * ber-PO (mutableOrderError) dan pull timesheet WO (closedWorkOrderError
 * menolak completed/cancelled/closed). Biaya yang masuk sesudah klaim
 * garansi closed + E2 terposting tak pernah terjurnal ulang. Status
 * closed tetap diurus assertJobCostMutable di dalam tx.
 */
function mutableWorkOrderError(
  wo: { status: string } | null,
  verb: "ditambahkan" | "diubah" | "dihapus",
): { success: false; error: string } | null {
  if (!wo) return { success: false, error: "Perintah kerja tidak ditemukan" }
  if (wo.status === "completed" || wo.status === "cancelled") {
    return {
      success: false,
      error: `Biaya tidak dapat ${verb} pada perintah kerja berstatus '${wo.status}'.`,
    }
  }
  return null
}

/** Production orders keep their cost locked once completed/cancelled. */
function mutableOrderError(
  order: { status: string; completedQty?: unknown } | null,
  verb: "ditambahkan" | "diubah" | "dihapus",
): { success: false; error: string } | null {
  if (!order) return { success: false, error: "Perintah produksi tidak ditemukan" }
  if (order.status === "closed") {
    return {
      success: false,
      error: `Biaya tidak dapat ${verb} pada perintah berstatus 'closed' (job sudah ditutup). Buka kembali (reopen) dengan alasan untuk mengubah biaya.`,
    }
  }
  if (order.status === "completed" || order.status === "cancelled") {
    return {
      success: false,
      error: `Biaya tidak dapat ${verb} pada perintah berstatus '${order.status}'.`,
    }
  }
  // STOK-14: sesudah release parsial pertama, pool WIP dibagi per release
  // atas qty SISA — biaya baru mengubah unit cost release berikutnya saja
  // dan batch produk sama berakhir dengan biaya beda. Bekukan mutasi biaya
  // non-material di sini (pola yang sama: HPP completed final di
  // syncServicePurchaseOrderCost F-71). Baris existing tetap bisa dibaca;
  // penambahan/koreksi nilai diblokir sampai order selesai penuh, sesudah
  // itu gerbang completed di atas yang menolak.
  if (Number(order.completedQty ?? 0) > 0) {
    return {
      success: false,
      error: `Biaya tidak dapat ${verb} sesudah sebagian hasil produksi dirilis (release parsial). Biaya tambahan hanya boleh dicatat sebelum release pertama atau sesudah order selesai.`,
    }
  }
  return null
}

/**
 * STOK-14 in-transaction re-check: kunci baris order (pola yang sama dengan
 * applyProductionCostDelta + completeProductionOrder) lalu baca ulang
 * status/completedQty, supaya release parsial yang commit bersamaan dengan
 * mutasi biaya tidak lolos dari cek luar transaksi.
 */
async function assertNoPartialRelease(
  tx: TxClient,
  productionOrderId: number,
  verb: "ditambahkan" | "diubah" | "dihapus",
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${productionOrderId} FOR UPDATE`
  const fresh = await tx.productionOrder.findUnique({
    where: { id: productionOrderId },
    select: { status: true, completedQty: true },
  })
  const invalid = mutableOrderError(fresh, verb)
  if (invalid) throw new Error(invalid.error)
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
        select: { id: true, status: true, documentNo: true, completedQty: true },
      })
      const invalid = mutableOrderError(order, "ditambahkan")
      if (invalid) return invalid
    }
    if (v.workOrderId) {
      const wo = await prisma.workOrder.findUnique({
        where: { id: v.workOrderId },
        select: { id: true, status: true },
      })
      if (!v.productionOrderId) {
        const invalidWo = mutableWorkOrderError(wo, "ditambahkan")
        if (invalidWo) return invalidWo
      } else if (!wo) {
        return { success: false, error: "Perintah kerja tidak ditemukan" }
      }
    }
    if (v.vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: v.vendorId },
        select: { id: true, isActive: true, deletedAt: true },
      })
      if (!vendor) return { success: false, error: "Vendor tidak ditemukan" }
      if (vendor.deletedAt != null || !vendor.isActive) {
        return { success: false, error: "Vendor biaya tidak aktif atau sudah dihapus — pilih ulang vendor." }
      }
    }

    const cost = await prisma.$transaction(async (tx) => {
      // Gerbang periode dinilai ulang di dalam tx (kunci baris setting):
      // tutup periode yang commit sesudah assert luar tidak boleh dilompati
      // baris biaya bertanggal hari ini (jalur WO-only tanpa backstop jurnal).
      await assertPeriodOpen(new Date(), tx)
      // Putaran 64: retry identik melahirkan baris biaya kembar —
      // totalActualCost dan jurnal WIP naik dua kali, HPP membengkak.
      await checkIdempotency(formData.get("idempotencyKey") as string | null, tx, user.id)
      // F-009-V: guard closed di dalam tx (PO/WO tertutup ditolak server).
      await assertJobCostMutable(
        { productionOrderId: v.productionOrderId ?? null, workOrderId: v.workOrderId ?? null },
        "ditambahkan",
        tx,
      )
      if (v.productionOrderId) await assertNoPartialRelease(tx, v.productionOrderId, "ditambahkan")
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
      select: { id: true, productionOrderId: true, workOrderId: true, amount: true, vendorId: true },
    })
    if (!existing) return { success: false, error: "Biaya tidak ditemukan" }

    // Hanya relink vendor yang dinilai hidup; vendor lama tak berubah
    // (kini nonaktif) tidak memblokir edit biaya lain.
    if (v.vendorId && v.vendorId !== existing.vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: v.vendorId },
        select: { id: true, isActive: true, deletedAt: true },
      })
      if (!vendor) return { success: false, error: "Vendor tidak ditemukan" }
      if (vendor.deletedAt != null || !vendor.isActive) {
        return { success: false, error: "Vendor biaya tidak aktif atau sudah dihapus — pilih ulang vendor." }
      }
    }

    if (existing.productionOrderId) {
      const order = await prisma.productionOrder.findUnique({
        where: { id: existing.productionOrderId },
        select: { id: true, status: true, completedQty: true },
      })
      const invalid = mutableOrderError(order, "diubah")
      if (invalid) return invalid
    }
    if (!existing.productionOrderId && existing.workOrderId) {
      const wo = await prisma.workOrder.findUnique({
        where: { id: existing.workOrderId },
        select: { id: true, status: true },
      })
      const invalidWo = mutableWorkOrderError(wo, "diubah")
      if (invalidWo) return invalidWo
    }

    await prisma.$transaction(async (tx) => {
      // Kunci baris biaya lalu baca ulang amount SEBELUM hitung delta:
      // snapshot di luar tx basi bila penulis lain mengubah baris yang
      // sama; delta atas amount basi menggeser totalActualCost + jurnal
      // WIP dari jumlah baris final (kunci PO hanya menserialkan penulis,
      // tidak menyegarkan input delta).
      await tx.$queryRaw`SELECT id FROM production_costs WHERE id = ${id} FOR UPDATE`
      const fresh = await tx.productionCost.findUnique({
        where: { id },
        select: { amount: true },
      })
      if (!fresh) throw new Error("Biaya tidak ditemukan")
      await assertPeriodOpen(new Date(), tx)
      await assertJobCostMutable(
        { productionOrderId: existing.productionOrderId, workOrderId: existing.workOrderId },
        "diubah",
        tx,
      )
      if (existing.productionOrderId) await assertNoPartialRelease(tx, existing.productionOrderId, "diubah")
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
        const delta = safeSubtract(v.amount, Number(fresh.amount), 2)
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
      select: { id: true, productionOrderId: true, workOrderId: true, amount: true },
    })
    if (!existing) return { success: false, error: "Biaya tidak ditemukan" }

    if (existing.productionOrderId) {
      const order = await prisma.productionOrder.findUnique({
        where: { id: existing.productionOrderId },
        select: { id: true, status: true, completedQty: true },
      })
      const invalid = mutableOrderError(order, "dihapus")
      if (invalid) return invalid
    }
    if (!existing.productionOrderId && existing.workOrderId) {
      const wo = await prisma.workOrder.findUnique({
        where: { id: existing.workOrderId },
        select: { id: true, status: true },
      })
      const invalidWo = mutableWorkOrderError(wo, "dihapus")
      if (invalidWo) return invalidWo
    }

    await prisma.$transaction(async (tx) => {
      // Cermin updateProductionCost: kunci baris biaya, amount segar
      // menjadi pengurang — snapshot luar bisa basi oleh penulis konkuren.
      await tx.$queryRaw`SELECT id FROM production_costs WHERE id = ${id} FOR UPDATE`
      const fresh = await tx.productionCost.findUnique({
        where: { id },
        select: { amount: true },
      })
      if (!fresh) throw new Error("Biaya tidak ditemukan")
      await assertPeriodOpen(new Date(), tx)
      await assertJobCostMutable(
        { productionOrderId: existing.productionOrderId, workOrderId: existing.workOrderId },
        "dihapus",
        tx,
      )
      if (existing.productionOrderId) await assertNoPartialRelease(tx, existing.productionOrderId, "dihapus")
      await tx.productionCost.delete({ where: { id } })
      if (existing.productionOrderId) {
        await applyProductionCostDelta(existing.productionOrderId, -Number(fresh.amount), tx, {
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
      select: { id: true, status: true, workOrderId: true, completedQty: true },
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

    // BUGHUNT round3 MEDIUM: dedupe di luar tx HANYA fast-path penolakan —
    // keputusan final dibaca ulang DI DALAM tx di bawah (kunci baris
    // timesheet), supaya dua klik paralel tidak sama-sama lolos dan
    // menggandakan labor HPP. ponytail: tanpa unique DB pada
    // sourceTimesheetId (di luar ruang lingkup), kunci baris timesheet
    // kandidat adalah penjaga serialisasi; tambahkan unique + migrasi bila
    // jalur penulisan ProductionCost bertambah.
    const alreadyPulledOutside = await prisma.productionCost.findMany({
      where: { sourceTimesheetId: { in: timesheets.map((t) => t.id) } },
      select: { sourceTimesheetId: true },
    })
    if (alreadyPulledOutside.length >= timesheets.length) {
      return { success: false, error: "Semua timesheet proyek ini sudah ditarik ke biaya produksi." }
    }

    let totalAdded = 0
    let createdCount = 0
    await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(new Date(), tx)
      await assertJobCostMutable({ productionOrderId, workOrderId }, "ditambahkan", tx)
      await assertNoPartialRelease(tx, productionOrderId, "ditambahkan")
      // Kunci baris timesheet kandidat (urutan id global = bebas deadlock
      // antar penarik), lalu dedupe dibaca ulang di dalam tx — pola jalur WO
      // (pullLaborCostFromWorkOrderTimesheets) + kunci baris.
      const timesheetIds = timesheets.map((t) => t.id)
      await tx.$queryRaw`SELECT id FROM timesheets WHERE id IN (${Prisma.join(timesheetIds)}) ORDER BY id FOR UPDATE`
      // Jam/deskripsi dinilai ulang dari bacaan TERKUNCI: snapshot luar tx
      // hanya semesta kandidat. Bacaan ini bukan sekadar baca ulang —
      // bacaan konsisten pertama transaksi ini (snapshot dibentuk di
      // titik ini, sesudah kunci), jadi nilai yang kembali adalah nilai
      // yang akan dipegang sampai commit; dan sisi penulis
      // (updateTimesheet/deleteTimesheet) mengunci baris yang sama, jadi
      // sesudah titik ini jam beku. Tanpa ini amount memakai jam basi:
      // koreksi yang commit sesudah snapshot tapi sebelum kunci menulis
      // ProductionCost jam lama dan sesudahnya timesheet terkunci
      // timesheetPulledError — subledger HPP tak pernah bisa dikoreksi.
      const lockedTimesheets = await tx.timesheet.findMany({
        where: { id: { in: timesheetIds } },
        select: { id: true, hours: true, date: true, description: true },
      })
      const freshById = new Map(lockedTimesheets.map((t) => [t.id, t]))
      const alreadyPulled = await tx.productionCost.findMany({
        where: { sourceTimesheetId: { in: timesheetIds } },
        select: { sourceTimesheetId: true },
      })
      const pulledSet = new Set(alreadyPulled.map((c) => c.sourceTimesheetId))
      const toCreate = timesheets
        .map((t) => freshById.get(t.id))
        .filter((t): t is (typeof timesheets)[number] => t != null && !pulledSet.has(t.id))
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
        createdCount += 1
        totalAdded = Math.round((totalAdded + amount) * 100) / 100
      }
      if (totalAdded > 0) {
        await applyProductionCostDelta(productionOrderId, totalAdded, tx, { userId: Number(user.id) })
      }
    })

    if (createdCount > 0) {
      await logActivity("create", "ProductionCost", productionOrderId,
        `Menarik ${createdCount} timesheet → biaya tenaga kerja Rp${totalAdded} ke perintah produksi #${productionOrderId}`,
      )
    }
    revalidatePath(`/produksi/production-orders/${productionOrderId}`)
    return { success: true, added: totalAdded, count: createdCount }
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
      // Jalur WO-only tanpa jurnal: gerbang periode dalam tx adalah
      // satu-satunya penjaga lawan tutup periode konkuren.
      await assertPeriodOpen(new Date(), tx)
      // Putaran 22: status WO dinilai ulang di dalam tx (pola jalur
      // proyek) — close konkuren sesudah cek luar tak boleh melahirkan
      // ProductionCost menempel WO closed (klaim job-closeout.service).
      await assertJobCostMutable({ workOrderId }, "ditambahkan", tx)
      // Kunci baris timesheet kandidat (urutan id global) lalu dedupe
      // dibaca ulang di dalam tx — cermin jalur proyek di atas. Tanpa
      // kunci, dua penarik konkuren sama-sama membaca snapshot kosong
      // dan menggandakan baris labor timesheet yang sama; tanpa unique
      // DB pada sourceTimesheetId, kunci baris adalah serialisasinya.
      const timesheetIds = timesheets.map((t) => t.id)
      await tx.$queryRaw`SELECT id FROM timesheets WHERE id IN (${Prisma.join(timesheetIds)}) ORDER BY id FOR UPDATE`
      // Jam/deskripsi dinilai ulang dari bacaan TERKUNCI (cermin jalur
      // proyek di atas): snapshot luar tx hanya semesta kandidat; bacaan
      // konsisten pertama transaksi ini terbentuk sesudah kunci dan sisi
      // penulis (updateTimesheet/deleteTimesheet) mengunci baris yang
      // sama, jadi sesudah titik ini jam beku. Tanpa ini amount memakai
      // jam basi yang sesudahnya terkunci timesheetPulledError.
      const lockedTimesheets = await tx.timesheet.findMany({
        where: { id: { in: timesheetIds } },
        select: { id: true, hours: true, date: true, description: true },
      })
      const freshById = new Map(lockedTimesheets.map((t) => [t.id, t]))
      // Dibaca ulang di dalam transaksi: semesta idempoten per-timesheet
      // global (lintas jalur proyek/WO), bukan per perintah.
      const alreadyPulled = await tx.productionCost.findMany({
        where: { sourceTimesheetId: { in: timesheetIds } },
        select: { sourceTimesheetId: true },
      })
      const pulledSet = new Set(alreadyPulled.map((c) => c.sourceTimesheetId))
      for (const snapshot of timesheets) {
        const t = freshById.get(snapshot.id)
        if (t == null || pulledSet.has(t.id)) continue
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
      select: { id: true, status: true, documentNo: true, completedQty: true },
    })
    if (!order) return { success: false, error: "Perintah produksi tidak ditemukan" }
    if (order.status === "closed") {
      return { success: false, error: "Overhead tidak dapat diterapkan ke perintah berstatus 'closed' (job sudah ditutup). Buka kembali (reopen) dengan alasan untuk mengubah biaya." }
    }
    if (order.status === "completed" || order.status === "cancelled") {
      return { success: false, error: `Overhead tidak dapat diterapkan ke perintah berstatus '${order.status}'.` }
    }
    // STOK-14: overhead susulan sesudah release parsial dibekukan sama
    // seperti jalur biaya manual (mutableOrderError).
    if (Number(order.completedQty ?? 0) > 0) {
      return { success: false, error: "Overhead tidak dapat diterapkan sesudah sebagian hasil produksi dirilis (release parsial)." }
    }

    const driverLabel = OVERHEAD_DRIVER_LABELS[v.driverType]

    const cost = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(new Date(), tx)
      await assertJobCostMutable({ productionOrderId: v.productionOrderId }, "ditambahkan", tx)
      await assertNoPartialRelease(tx, v.productionOrderId, "ditambahkan")
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
