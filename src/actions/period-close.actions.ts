"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"

/** Halaman & turunan yang menampilkan tanggal kunci periode. */
function revalidatePeriodConsumers(): void {
  revalidatePath("/pengaturan/proses-akhir-bulan")
  revalidatePath("/pengaturan/preferensi")
  revalidatePath("/pengaturan/ubah")
}

export interface PeriodCloseActionResult {
  success: boolean
  error?: string
  message?: string
}

/**
 * Menutup periode akuntansi sampai `date` (biasanya akhir bulan).
 *
 * Sengaja **tidak** menurunkan kunci yang sudah lebih maju: mengunci ke tanggal
 * yang lebih awal dari kunci berjalan akan membuka kembali periode yang sudah
 * ditutup tanpa disadari — koreksi seperti itu harus eksplisit lewat "Buka kunci".
 */
export async function closeAccountingPeriod(formData: FormData): Promise<PeriodCloseActionResult> {
  try {
    await requirePermission("manage_settings")

    const raw = String(formData.get("date") ?? "").trim()
    const date = new Date(`${raw}T23:59:59`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(date.getTime())) {
      return { success: false, error: "Tanggal kunci periode tidak valid." }
    }

    const settings = await prisma.systemSetting.findFirst({ select: { id: true, periodLockDate: true } })
    if (!settings) return { success: false, error: "Pengaturan sistem tidak ditemukan." }

    if (settings.periodLockDate && settings.periodLockDate.getTime() > date.getTime()) {
      return {
        success: false,
        error: `Periode sudah dikunci sampai ${settings.periodLockDate.toLocaleDateString("id-ID")}. Buka kunci dulu bila memang ingin memundurkannya.`,
      }
    }

    await prisma.systemSetting.update({ where: { id: settings.id }, data: { periodLockDate: date } })
    await logActivity(
      "update",
      "SystemSetting",
      settings.id,
      `Mengunci periode akuntansi sampai ${date.toLocaleDateString("id-ID")}`,
    )
    revalidatePeriodConsumers()

    return { success: true, message: `Periode dikunci sampai ${date.toLocaleDateString("id-ID")}.` }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("closeAccountingPeriod failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal mengunci periode.") }
  }
}

/**
 * Membuka kunci periode (menghapus `periodLockDate`).
 *
 * Disediakan sebagai jalan koreksi eksplisit; jejaknya tetap tercatat di log
 * aktivitas sehingga pembukaan kunci tidak bisa terjadi diam-diam.
 */
export async function reopenAccountingPeriod(): Promise<PeriodCloseActionResult> {
  try {
    await requirePermission("manage_settings")

    const settings = await prisma.systemSetting.findFirst({ select: { id: true, periodLockDate: true } })
    if (!settings) return { success: false, error: "Pengaturan sistem tidak ditemukan." }
    if (!settings.periodLockDate) return { success: false, error: "Periode belum dikunci." }

    await prisma.systemSetting.update({ where: { id: settings.id }, data: { periodLockDate: null } })
    await logActivity(
      "update",
      "SystemSetting",
      settings.id,
      `Membuka kunci periode (sebelumnya sampai ${settings.periodLockDate.toLocaleDateString("id-ID")})`,
    )
    revalidatePeriodConsumers()

    return { success: true, message: "Kunci periode dibuka." }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("reopenAccountingPeriod failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal membuka kunci periode.") }
  }
}
