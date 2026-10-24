"use server"

import { revalidatePath } from "next/cache"

import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import {
  postYearEndClosing,
  requestYearEndClosingApproval,
  reverseYearEndClosing,
} from "@/lib/services/year-end-closing.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"

export interface YearEndClosingActionResult {
  success: boolean
  error?: string
  message?: string
  journalId?: number
  journalNumber?: string
}

function parseFiscalYear(formData: FormData): number | null {
  const raw = String(formData.get("fiscalYear") ?? "").trim()
  if (!/^\d{4}$/.test(raw)) return null
  const year = Number(raw)
  return year >= 1900 && year <= 2200 ? year : null
}

function revalidateYearEndClosingConsumers(): void {
  revalidatePath("/pengaturan/proses-akhir-bulan")
  revalidatePath("/laporan")
}

/**
 * Ajukan approval penutup tahun (F-2026-10-23-121-V Putusan 4). Tanpa
 * workflow terkonfigurasi = no-op mundur-kompatibel; pengaju tidak
 * menyetujui sendiri (mesin approval existing yang menegakkan).
 */
export async function requestYearEndClosingApprovalAction(
  formData: FormData,
): Promise<YearEndClosingActionResult> {
  try {
    const user = await requirePermission("manage_settings")
    const fiscalYear = parseFiscalYear(formData)
    if (fiscalYear === null) return { success: false, error: "Tahun fiskal tidak valid." }

    const requested = await requestYearEndClosingApproval(fiscalYear, Number(user.id))
    await logActivity(
      "create",
      "YearEndClosing",
      fiscalYear,
      requested
        ? `Mengajukan persetujuan penutup tahun fiskal ${fiscalYear}`
        : `Penutup tahun fiskal ${fiscalYear} tanpa alur persetujuan terkonfigurasi`,
    )
    revalidateYearEndClosingConsumers()
    return {
      success: true,
      message: requested
        ? `Persetujuan penutup tahun fiskal ${fiscalYear} diajukan.`
        : `Tidak ada alur persetujuan aktif untuk penutup tahun fiskal ${fiscalYear}; posting dapat langsung dilakukan pemegang izin.`,
    }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("requestYearEndClosingApprovalAction failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal mengajukan persetujuan penutup tahun.") }
  }
}

/**
 * Posting jurnal penutup tahun fiskal (Putusan 2). Izin sama dengan tutup
 * periode existing (`manage_settings`) — pemegang izin ini non-admin juga
 * mendapat aksi posting; pemisahan verba ditunda per vonis.
 */
export async function postYearEndClosingAction(formData: FormData): Promise<YearEndClosingActionResult> {
  try {
    const user = await requirePermission("manage_settings")
    const fiscalYear = parseFiscalYear(formData)
    if (fiscalYear === null) return { success: false, error: "Tahun fiskal tidak valid." }

    const result = await postYearEndClosing(fiscalYear, Number(user.id))
    await logActivity(
      "create",
      "Journal",
      result.journalId,
      `Posting jurnal penutup tahun fiskal ${fiscalYear} (${result.journalNumber})`,
    )
    revalidateYearEndClosingConsumers()
    return {
      success: true,
      message: `Jurnal penutup tahun fiskal ${fiscalYear} terposting (${result.journalNumber}).`,
      journalId: result.journalId,
      journalNumber: result.journalNumber,
    }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("postYearEndClosingAction failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal posting jurnal penutup tahun.") }
  }
}

/** Reversal penuh jurnal penutup (Putusan 3) — satu-satunya jalur koreksi. */
export async function reverseYearEndClosingAction(formData: FormData): Promise<YearEndClosingActionResult> {
  try {
    const user = await requirePermission("manage_settings")
    const fiscalYear = parseFiscalYear(formData)
    if (fiscalYear === null) return { success: false, error: "Tahun fiskal tidak valid." }

    const result = await reverseYearEndClosing(fiscalYear, Number(user.id))
    await logActivity(
      "update",
      "Journal",
      result.journalId,
      `Reversal jurnal penutup tahun fiskal ${fiscalYear} (${result.journalNumber})`,
    )
    revalidateYearEndClosingConsumers()
    return {
      success: true,
      message: `Jurnal penutup tahun fiskal ${fiscalYear} berhasil di-reversal (${result.journalNumber}).`,
      journalId: result.journalId,
      journalNumber: result.journalNumber,
    }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("reverseYearEndClosingAction failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal reversal jurnal penutup tahun.") }
  }
}
