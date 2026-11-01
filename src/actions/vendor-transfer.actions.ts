"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { normalizeTransferSelection } from "@/lib/finance/vendor-transfer"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { vendorTransferSchema } from "@/lib/validations/purchase.schemas"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"

const REVALIDATE = "/pembelian/transfer-pemasok"

export interface VendorTransferActionResult {
  success: boolean
  error?: string
  updated?: number
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

    const parsed = parseFormData(vendorTransferSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const date = wibDateToUtcMidnight(parsed.data.date)

    await assertPeriodOpen(date)

    const reference = parsed.data.reference?.trim() || null

    // Klaim kondisional: hanya baris yang BELUM ditransfer yang boleh
    // ditandai. Tanpa syarat ini, unmark koreksi yang commit di tengah
    // tertimpa mark dari snapshot basi (pembayaran terkirim tampil belum
    // ditransfer -> instruksi transfer kedua), dan `updated` melaporkan
    // jumlah snapshot, bukan jumlah yang benar-benar berubah.
    const result = await prisma.vendorPayment.updateMany({
      where: { id: { in: selection.ids }, deletedAt: null, transferredAt: null },
      data: { transferredAt: date, transferReference: reference },
    })
    if (result.count === 0) {
      const anyExists = await prisma.vendorPayment.count({
        where: { id: { in: selection.ids }, deletedAt: null },
      })
      return anyExists === 0
        ? { success: false, error: "Pembayaran yang dipilih tidak ditemukan." }
        : { success: false, error: "Semua pembayaran yang dipilih sudah ditandai ditransfer." }
    }

    await logActivity(
      "update",
      "VendorPayment",
      selection.ids[0],
      `Menandai ${result.count} pembayaran vendor sudah ditransfer (${reference ?? "tanpa referensi"})`,
    )
    revalidatePath(REVALIDATE)

    return { success: true, updated: result.count }
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

    // Koreksi penanda transfer tetap dijaga period-lock: ambil tanggal
    // transfer tersimpan, tolak bila berada di periode tertutup.
    const existing = await prisma.vendorPayment.findMany({
      where: { id: { in: selection.ids }, deletedAt: null },
      select: { transferredAt: true },
    })
    for (const row of existing) {
      if (row.transferredAt) await assertPeriodOpen(row.transferredAt)
    }

    // Klaim kondisional arah sebaliknya: hanya baris yang SEDANG ditandai
    // yang boleh dibatalkan tandanya — mark baru yang commit sesudah
    // findMany period-lock di atas tidak boleh terhapus oleh unmark basi.
    const result = await prisma.vendorPayment.updateMany({
      where: { id: { in: selection.ids }, deletedAt: null, transferredAt: { not: null } },
      data: { transferredAt: null, transferReference: null },
    })
    if (result.count === 0) {
      const anyExists = await prisma.vendorPayment.count({
        where: { id: { in: selection.ids }, deletedAt: null },
      })
      return anyExists === 0
        ? { success: false, error: "Pembayaran yang dipilih tidak ditemukan." }
        : { success: false, error: "Semua pembayaran yang dipilih belum ditandai ditransfer." }
    }

    await logActivity("update", "VendorPayment", selection.ids[0], `Membatalkan penanda transfer ${result.count} pembayaran`)
    revalidatePath(REVALIDATE)

    return { success: true, updated: result.count }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("unmarkVendorPaymentsTransferred failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal membatalkan penanda transfer.") }
  }
}
