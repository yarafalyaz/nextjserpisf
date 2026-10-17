"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { normalizeTransferSelection } from "@/lib/finance/vendor-transfer"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"

const REVALIDATE = "/pembelian/transfer-pemasok"

export interface VendorTransferActionResult {
  success: boolean
  error?: string
  updated?: number
}

function parseDate(raw: string): Date | null {
  const text = raw.trim()
  if (!text) return null
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Menandai pembayaran vendor sebagai **sudah ditransfer**.
 *
 * Tidak membuat jurnal: jurnal kas/bank sudah dibuat saat pembayaran vendor
 * dikonfirmasi. Yang ditambahkan hanya waktu + referensi bukti transfer, supaya
 * daftar instruksi tidak menagih ulang pembayaran yang sudah dikirim.
 */
export async function markVendorPaymentsTransferred(formData: FormData): Promise<VendorTransferActionResult> {
  try {
    await requirePermission("edit_vendor_payments")

    const selection = normalizeTransferSelection(formData.getAll("paymentIds").map((value) => String(value)))
    if (selection.error) return { success: false, error: selection.error }

    const rawDate = String(formData.get("date") ?? "").trim()
    const date = parseDate(rawDate)
    if (!date) return { success: false, error: "Tanggal transfer tidak valid." }

    const reference = String(formData.get("reference") ?? "").trim() || null

    // Hanya pembayaran yang benar-benar ada (dan belum dihapus) yang boleh ditandai.
    const payments = await prisma.vendorPayment.findMany({
      where: { id: { in: selection.ids }, deletedAt: null },
      select: { id: true, documentNo: true },
    })
    if (payments.length === 0) return { success: false, error: "Pembayaran yang dipilih tidak ditemukan." }

    await prisma.vendorPayment.updateMany({
      where: { id: { in: payments.map((payment) => payment.id) } },
      data: { transferredAt: date, transferReference: reference },
    })

    await logActivity(
      "update",
      "VendorPayment",
      payments[0].id,
      `Menandai ${payments.length} pembayaran vendor sudah ditransfer (${reference ?? "tanpa referensi"})`,
    )
    revalidatePath(REVALIDATE)

    return { success: true, updated: payments.length }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("markVendorPaymentsTransferred failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menandai transfer.") }
  }
}

/** Membatalkan penanda transfer (jalan koreksi bila salah tandai). */
export async function unmarkVendorPaymentsTransferred(formData: FormData): Promise<VendorTransferActionResult> {
  try {
    await requirePermission("edit_vendor_payments")

    const selection = normalizeTransferSelection(formData.getAll("paymentIds").map((value) => String(value)))
    if (selection.error) return { success: false, error: selection.error }

    const result = await prisma.vendorPayment.updateMany({
      where: { id: { in: selection.ids }, deletedAt: null },
      data: { transferredAt: null, transferReference: null },
    })
    if (result.count === 0) return { success: false, error: "Pembayaran yang dipilih tidak ditemukan." }

    await logActivity("update", "VendorPayment", selection.ids[0], `Membatalkan penanda transfer ${result.count} pembayaran`)
    revalidatePath(REVALIDATE)

    return { success: true, updated: result.count }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("unmarkVendorPaymentsTransferred failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal membatalkan penanda transfer.") }
  }
}
