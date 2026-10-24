"use server"

/**
 * Aksi tindak lanjut penagihan piutang (F-2026-10-22-089-S tahap 2,
 * PUTUSAN BOT 1 Q-COL-1/2 di backlog §9A).
 *
 * - Catat: izin BARU `create_invoice_collection_followups` (Q-COL-1,
 *   bukan pinjam tukar faktur / edit faktur). Append-only (BR-COL-06):
 *   tidak ada aksi ubah; koreksi = catatan baru.
 * - Kosakata channel/outcome + janji divalidasi murni di
 *   `collection-followup-validation.ts` (Q-COL-2, AC-COL-11).
 * - Soft-delete: hanya pemegang izin yang sama YANG JUGA memegang
 *   `view_reports` (Q-COL-1), tercatat ActivityLog.
 * - TIDAK PERNAH jurnal, TIDAK mengubah paidAmount/status faktur,
 *   TIDAK mencatat pembayaran (BR-COL-07). Klik WA bukan tindak
 *   lanjut — hanya simpan eksplisit di sini yang tercatat (BR-COL-08).
 */

import { revalidatePath } from "next/cache"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { validateCollectionFollowUpInput } from "@/lib/reports/collection-followup-validation"
import type { CollectionFollowUpWriteInput } from "@/lib/reports/collection-followup-validation"

const REVALIDATE = "/penjualan/antrean-penagihan"

export interface CollectionFollowUpActionResult {
  success: boolean
  error?: string
  id?: number
}

function parseId(raw: unknown): number | null {
  const str = String(raw ?? "")
  if (!/^[0-9]+$/.test(str)) return null
  const value = Number(str)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function parseAmount(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null
  const str = String(raw).trim()
  if (str === "") return null
  const value = Number(str)
  return Number.isFinite(value) ? value : Number.NaN
}

export async function createInvoiceCollectionFollowUp(
  formData: FormData,
): Promise<CollectionFollowUpActionResult> {
  try {
    const user = await requirePermission("create_invoice_collection_followups")

    const input: CollectionFollowUpWriteInput = {
      salesInvoiceId: parseId(formData.get("salesInvoiceId")) ?? 0,
      followedUpAt: String(formData.get("followedUpAt") ?? ""),
      channel: String(formData.get("channel") ?? ""),
      outcome: String(formData.get("outcome") ?? ""),
      promisedDate: formData.get("promisedDate")
        ? String(formData.get("promisedDate"))
        : null,
      promisedAmount: parseAmount(formData.get("promisedAmount")),
      notes: formData.get("notes") ? String(formData.get("notes")) : null,
    }
    const validated = validateCollectionFollowUpInput(input)

    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: validated.salesInvoiceId, deletedAt: null },
      select: { id: true, documentNo: true, status: true },
    })
    if (!invoice) return { success: false, error: "Faktur tidak ditemukan." }
    if (invoice.status !== "posted" && invoice.status !== "partial") {
      return {
        success: false,
        error: "Tindak lanjut hanya untuk faktur yang sudah diposting dan belum lunas.",
      }
    }

    const created = await prisma.invoiceCollectionFollowUp.create({
      data: {
        salesInvoiceId: validated.salesInvoiceId,
        followedUpAt: validated.followedUpAt,
        channel: validated.channel,
        outcome: validated.outcome,
        promisedDate: validated.promisedDate,
        promisedAmount: validated.promisedAmount,
        notes: validated.notes,
        createdBy: Number(user.id),
      },
      select: { id: true },
    })

    await logActivity(
      "invoice_collection_followup_created",
      "InvoiceCollectionFollowUp",
      created.id,
      `Tindak lanjut penagihan ${invoice.documentNo} — ${validated.channel}/${validated.outcome}`,
    )
    revalidatePath(REVALIDATE)

    return { success: true, id: created.id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("createInvoiceCollectionFollowUp failed:", error)
    return {
      success: false,
      error: getErrorMessage(error, "Gagal mencatat tindak lanjut penagihan."),
    }
  }
}

export async function deleteInvoiceCollectionFollowUp(
  formData: FormData,
): Promise<CollectionFollowUpActionResult> {
  try {
    // Q-COL-1: soft-delete hanya pemegang izin catat yang juga view_reports.
    const user = await requirePermission("create_invoice_collection_followups")
    await requirePermission("view_reports")

    const id = parseId(formData.get("id"))
    if (id == null) return { success: false, error: "Tindak lanjut tidak valid." }

    const existing = await prisma.invoiceCollectionFollowUp.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        salesInvoice: { select: { documentNo: true } },
      },
    })
    if (!existing) return { success: false, error: "Tindak lanjut tidak ditemukan." }

    await prisma.invoiceCollectionFollowUp.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await logActivity(
      "invoice_collection_followup_deleted",
      "InvoiceCollectionFollowUp",
      id,
      `Tindak lanjut penagihan ${existing.salesInvoice.documentNo} dihapus (soft-delete) oleh pengguna ${Number(user.id)}`,
    )
    revalidatePath(REVALIDATE)

    return { success: true, id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("deleteInvoiceCollectionFollowUp failed:", error)
    return {
      success: false,
      error: getErrorMessage(error, "Gagal menghapus tindak lanjut penagihan."),
    }
  }
}
