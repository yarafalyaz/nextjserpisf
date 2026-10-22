"use server"

/**
 * F-2026-10-22-067-S inti: aksi jadwal termin per Quotation.
 * Putusan BOT 1 Q-TM67-1/3/5 (kartu t_40805adc) + vonis BOT 4
 * F-2026-10-22-072-V (PR #513).
 *
 * Penjaga mengikat:
 * - Izin reuse katalog (Q-TM67-5, tanpa key baru): kelola =
 *   edit_quotations, lihat = view_quotations.
 * - Satu jadwal aktif per Quotation dijaga di DALAM tx: lock baris
 *   quotation (FOR UPDATE, pola createProgressInvoice) lalu cek
 *   jadwal aktif di tx yang sama — submit konkuren kedua ditolak,
 *   bukan mengandalkan cek UI (AC-TM67-1, falsifikasi BOT 6).
 * - Jadwal TIDAK pernah menerbitkan invoice/DP/pembayaran/jurnal/
 *   faktur pajak (AC-TM67-5): aksi ini hanya menulis dua tabel
 *   jadwal. Penagihan tetap lewat createProgressInvoice existing;
 *   kandidat termin berikutnya hanya petunjuk persen untuk aksi itu.
 * - Amendemen (ubah baris) sesudah ada termin terpenuhi wajib alasan
 *   (BR-TM67-06): "terpenuhi" diukur dari billedAmountExcludingCancelled
 *   atas invoice tiga jembatan dibaca ulang di dalam tx, bukan dari
 *   DP dan bukan dari kiriman klien.
 * - Jadwal tidak menjadi gerbang: tidak ada aksi progres existing
 *   yang ditahan oleh jadwal ini.
 * - Quotation cancelled/dihapus: jadwal aktif ikut dinonaktifkan
 *   secara turunan di loader (status quotation dibaca loader kartu);
 *   baris jadwal tidak dihapus (jejak tetap terbaca).
 */

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma, TxClient } from "@/lib/db/prisma"
import { logActivity } from "@/lib/services/activity-log.service"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import {
  buildJobPaymentScheduleView,
  validateJobPaymentTerms,
} from "@/lib/reports/job-payment-schedule"
import { loadJobPaymentSchedule } from "@/lib/reports/job-payment-schedule-data"

const REVALIDATE = "/penjualan/penawaran"

type Tx = TxClient

export interface JobPaymentTermWriteInput {
  name: string
  cumulativePercent: number
  /** Tanggal kalender WIB "YYYY-MM-DD" (wajib per termin, Q-TM67-3). */
  dueDate: string
  milestoneLabel?: string | null
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function parseDueDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = wibDateToUtcMidnight(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function lockQuotationRow(tx: Tx, quotationId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`
}

/** Invoice tiga jembatan (definisi sama loader ringkasan tagihan), dibaca di dalam tx. */
async function collectQuotationInvoicesTx(tx: Tx, quotationId: number) {
  const [salesOrders, workOrders, directInvoices] = await Promise.all([
    tx.salesOrder.findMany({ where: { quotationId, deletedAt: null }, select: { id: true } }),
    tx.workOrder.findMany({ where: { quotationId }, select: { projectId: true } }),
    tx.salesInvoice.findMany({
      where: { quotationId, deletedAt: null },
      select: { id: true, status: true, grandTotal: true },
    }),
  ])
  const salesOrderIds = salesOrders.map((s) => s.id)
  const projectIds = [
    ...new Set(workOrders.map((w) => w.projectId).filter((p): p is number => p !== null)),
  ]
  const [viaSalesOrder, viaProject] = await Promise.all([
    salesOrderIds.length === 0
      ? Promise.resolve([])
      : tx.salesInvoice.findMany({
          where: { salesOrderId: { in: salesOrderIds }, deletedAt: null },
          select: { id: true, status: true, grandTotal: true },
        }),
    projectIds.length === 0
      ? Promise.resolve([])
      : tx.salesInvoice.findMany({
          where: { projectId: { in: projectIds }, deletedAt: null },
          select: { id: true, status: true, grandTotal: true },
        }),
  ])
  const byId = new Map<number, (typeof directInvoices)[number]>()
  for (const inv of [...directInvoices, ...viaSalesOrder, ...viaProject]) {
    byId.set(inv.id, inv)
  }
  return [...byId.values()].map((inv) => ({
    id: inv.id,
    status: inv.status,
    grandTotal: Number(inv.grandTotal),
  }))
}

function normalizeTerms(terms: JobPaymentTermWriteInput[]) {
  const normalized: {
    name: string
    cumulativePercent: number
    dueDate: Date
    milestoneLabel: string | null
  }[] = []
  for (const [i, term] of terms.entries()) {
    const dueDate = parseDueDate(term.dueDate)
    if (!dueDate) {
      throw new Error(`Termin ${i + 1}: tanggal jatuh tempo wajib format YYYY-MM-DD`)
    }
    normalized.push({
      name: cleanText(term.name),
      cumulativePercent: Number(term.cumulativePercent),
      dueDate,
      milestoneLabel: cleanText(term.milestoneLabel) || null,
    })
  }
  const error = validateJobPaymentTerms(normalized)
  if (error) throw new Error(error)
  return normalized
}

export async function createJobPaymentSchedule(input: {
  quotationId: number
  terms: JobPaymentTermWriteInput[]
}) {
  try {
    const user = await requirePermission("edit_quotations")
    const quotationId = Number(input.quotationId)
    const terms = normalizeTerms(input.terms ?? [])

    const schedule = await prisma.$transaction(async (tx) => {
      await lockQuotationRow(tx, quotationId)
      const quotation = await tx.quotation.findFirst({
        where: { id: quotationId, deletedAt: null },
        select: { id: true, documentNo: true, status: true },
      })
      if (!quotation) throw new Error("Penawaran tidak ditemukan")
      if (quotation.status === "cancelled") {
        throw new Error("Penawaran dibatalkan; jadwal termin tidak bisa dibuat")
      }
      const active = await tx.jobPaymentSchedule.findFirst({
        where: { quotationId, status: "aktif" },
        select: { id: true },
      })
      if (active) {
        throw new Error("Penawaran ini sudah memiliki jadwal termin aktif; ubah jadwal yang ada")
      }
      return tx.jobPaymentSchedule.create({
        data: {
          quotationId,
          status: "aktif",
          createdBy: Number(user.id),
          terms: {
            create: terms.map((t, i) => ({ ...t, sortOrder: i })),
          },
        },
        select: { id: true },
      })
    })

    await logActivity(
      "create",
      "JobPaymentSchedule",
      schedule.id,
      `Membuat jadwal termin penawaran #${quotationId} (${terms.length} termin)`,
    )
    revalidatePath(REVALIDATE)
    return { success: true, id: schedule.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createJobPaymentSchedule]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateJobPaymentScheduleTerms(input: {
  scheduleId: number
  terms: JobPaymentTermWriteInput[]
  reason?: string
}) {
  try {
    const user = await requirePermission("edit_quotations")
    const scheduleId = Number(input.scheduleId)
    const terms = normalizeTerms(input.terms ?? [])
    const reason = cleanText(input.reason)

    await prisma.$transaction(async (tx) => {
      const schedule = await tx.jobPaymentSchedule.findUnique({
        where: { id: scheduleId },
        select: {
          id: true,
          quotationId: true,
          status: true,
          terms: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              name: true,
              cumulativePercent: true,
              dueDate: true,
              milestoneLabel: true,
              sortOrder: true,
            },
          },
        },
      })
      if (!schedule) throw new Error("Jadwal termin tidak ditemukan")
      if (schedule.status !== "aktif") throw new Error("Jadwal termin sudah tidak aktif")

      await lockQuotationRow(tx, schedule.quotationId)
      const quotation = await tx.quotation.findFirst({
        where: { id: schedule.quotationId, deletedAt: null },
        select: { id: true, grandTotal: true },
      })
      if (!quotation) throw new Error("Penawaran tidak ditemukan")

      // BR-TM67-06: ubah baris sesudah ada termin terpenuhi wajib
      // alasan. Terpenuhi diukur ulang di tx dari tertagih existing.
      const invoices = await collectQuotationInvoicesTx(tx, schedule.quotationId)
      const view = buildJobPaymentScheduleView({
        scheduleId: schedule.id,
        quotationId: schedule.quotationId,
        quotationGrandTotal: Number(quotation.grandTotal),
        terms: schedule.terms.map((t) => ({
          ...t,
          cumulativePercent: Number(t.cumulativePercent),
        })),
        invoices,
        now: new Date(),
      })
      const hasFulfilled = view.terms.some((t) => t.status === "terpenuhi")
      if (hasFulfilled && reason === "") {
        throw new Error(
          "Mengubah jadwal sesudah ada termin terpenuhi wajib mengisi alasan perubahan",
        )
      }

      await tx.jobPaymentScheduleTerm.deleteMany({ where: { scheduleId } })
      await tx.jobPaymentScheduleTerm.createMany({
        data: terms.map((t, i) => ({ scheduleId, ...t, sortOrder: i })),
      })
      await tx.jobPaymentSchedule.update({
        where: { id: scheduleId },
        data:
          reason === ""
            ? {}
            : {
                amendmentReason: reason,
                amendedBy: Number(user.id),
                amendedAt: new Date(),
              },
      })
    })

    await logActivity(
      "update",
      "JobPaymentSchedule",
      scheduleId,
      reason === ""
        ? `Mengubah jadwal termin #${scheduleId} (${terms.length} termin)`
        : `Mengubah jadwal termin #${scheduleId}: ${reason}`,
    )
    revalidatePath(REVALIDATE)
    return { success: true, id: scheduleId }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateJobPaymentScheduleTerms]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function cancelJobPaymentSchedule(input: {
  scheduleId: number
  reason: string
}) {
  try {
    const user = await requirePermission("edit_quotations")
    const scheduleId = Number(input.scheduleId)
    const reason = cleanText(input.reason)
    if (reason === "") {
      return { success: false, error: "Alasan pembatalan jadwal wajib diisi" }
    }

    await prisma.$transaction(async (tx) => {
      const schedule = await tx.jobPaymentSchedule.findUnique({
        where: { id: scheduleId },
        select: { id: true, quotationId: true, status: true },
      })
      if (!schedule) throw new Error("Jadwal termin tidak ditemukan")
      if (schedule.status !== "aktif") throw new Error("Jadwal termin sudah tidak aktif")
      await lockQuotationRow(tx, schedule.quotationId)
      await tx.jobPaymentSchedule.update({
        where: { id: scheduleId },
        data: {
          status: "dibatalkan",
          cancelReason: reason,
          cancelledBy: Number(user.id),
          cancelledAt: new Date(),
        },
      })
    })

    await logActivity(
      "cancel",
      "JobPaymentSchedule",
      scheduleId,
      `Membatalkan jadwal termin #${scheduleId}: ${reason}`,
    )
    revalidatePath(REVALIDATE)
    return { success: true, id: scheduleId }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[cancelJobPaymentSchedule]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function getJobPaymentScheduleForQuotation(quotationId: number) {
  await requirePermission("view_quotations")
  return loadJobPaymentSchedule(Number(quotationId))
}
