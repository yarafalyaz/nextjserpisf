"use server"

import { revalidatePath } from "next/cache"

import { prisma, type TxClient } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"

/** Halaman & turunan yang menampilkan tanggal kunci periode. */
function revalidatePeriodConsumers(): void {
  revalidatePath("/pengaturan/proses-akhir-bulan")
  revalidatePath("/pengaturan/preferensi")
  revalidatePath("/pengaturan/ubah")
}

function normalizePeriodCloseDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const date = new Date(`${raw}T23:59:59`)
  const [year, month, day] = raw.split("-").map(Number)
  // `new Date("2026-02-30T23:59:59")` silently rolls to Mar 2 local.
  // Reject non-existent calendar date instead of locking 2 days later.
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

/**
 * R-09: kunci baris tunggal `system_settings` (FOR UPDATE), baca ulang di
 * dalam tx yang sama. Protokol identik dengan cabang `tx` pada
 * `assertPeriodOpen` (period-lock.service.ts), sehingga tutup/buka-periode
 * dan penulis jurnal/bank saling menunggu secara serial, bukan balapan
 * baca-lalu-tulis (TOCTOU).
 *
 * Urutan kunci & risiko deadlock: aksi tutup/buka-periode HANYA menahan
 * kunci baris setting ini. Jalur penulis (postJournal/updateJournal/
 * baris rekening koran) dapat sudah menahan kunci jurnal/bank lebih dulu
 * lalu menunggu kunci setting di `assertPeriodOpen(tx)`. Penulis bisa
 * menunggu tutup-periode, tetapi tutup-periode tidak pernah menunggu
 * jurnal/bank — jadi tidak ada siklus tunggu: tutup-periode selalu
 * menang/commit lebih dulu, lalu penulis membaca tanggal kunci yang baru
 * dan menolak bila tanggalnya tertutup.
 */
async function lockPeriodSettingRow(
  tx: TxClient,
): Promise<{ id: number; periodLockDate: Date | null } | null> {
  const rows = await tx.$queryRaw<Array<{ id: number; period_lock_date: Date | string | null }>>`
    SELECT id, period_lock_date FROM system_settings ORDER BY id LIMIT 1 FOR UPDATE
  `
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    periodLockDate: row.period_lock_date == null ? null : new Date(row.period_lock_date),
  }
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
    const date = normalizePeriodCloseDate(raw)
    if (!date) {
      return { success: false, error: "Tanggal kunci periode tidak valid." }
    }

    // Satu transaksi: kunci baris setting -> baca ulang -> validasi ->
    // update. Tanpa ini, cek "jangan turunkan kunci" dan update bisa
    // disela penulis/tutup-periode lain (TOCTOU R-09).
    const closed = await prisma.$transaction(async (tx) => {
      const settings = await lockPeriodSettingRow(tx)
      if (!settings) return { ok: false as const, error: "Pengaturan sistem tidak ditemukan." }

      if (settings.periodLockDate && settings.periodLockDate.getTime() > date.getTime()) {
        return {
          ok: false as const,
          error: `Periode sudah dikunci sampai ${settings.periodLockDate.toLocaleDateString("id-ID")}. Buka kunci dulu bila memang ingin memundurkannya.`,
        }
      }

      await tx.systemSetting.update({ where: { id: settings.id }, data: { periodLockDate: date } })
      return { ok: true as const, id: settings.id }
    })
    if (!closed.ok) return { success: false, error: closed.error }

    await logActivity(
      "update",
      "SystemSetting",
      closed.id,
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

    // Satu transaksi, protokol sama dengan tutup-periode di atas.
    const reopened = await prisma.$transaction(async (tx) => {
      const settings = await lockPeriodSettingRow(tx)
      if (!settings) return { ok: false as const, error: "Pengaturan sistem tidak ditemukan." }
      if (!settings.periodLockDate) return { ok: false as const, error: "Periode belum dikunci." }

      await tx.systemSetting.update({ where: { id: settings.id }, data: { periodLockDate: null } })
      return { ok: true as const, id: settings.id, previousLock: settings.periodLockDate }
    })
    if (!reopened.ok) return { success: false, error: reopened.error }

    await logActivity(
      "update",
      "SystemSetting",
      reopened.id,
      `Membuka kunci periode (sebelumnya sampai ${reopened.previousLock.toLocaleDateString("id-ID")})`,
    )
    revalidatePeriodConsumers()

    return { success: true, message: "Kunci periode dibuka." }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("reopenAccountingPeriod failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal membuka kunci periode.") }
  }
}
