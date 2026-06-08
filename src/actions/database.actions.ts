"use server"

import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage } from "@/lib/utils/error"
import {
  createBackup,
  restoreBackup,
  deleteBackup,
  listBackups,
  type BackupFile,
} from "@/lib/db/backup"

export type BackupResult = { success: boolean; message: string }

export async function getBackups(): Promise<BackupFile[]> {
  await requirePermission("manage_settings")
  return listBackups()
}

export async function createDatabaseBackup(): Promise<BackupResult> {
  try {
    await requirePermission("manage_settings")
    const file = await createBackup()
    await logActivity("create", "DatabaseBackup", 0, `Membuat backup database: ${file.filename}`)
    revalidatePath("/pengaturan/database")
    return { success: true, message: `Backup berhasil dibuat: ${file.filename}` }
  } catch (e) {
    return { success: false, message: getErrorMessage(e) || "Gagal membuat backup" }
  }
}

export async function restoreDatabaseBackup(filename: string): Promise<BackupResult> {
  try {
    await requirePermission("manage_settings")
    // Snapshot current state before destructive restore (best-effort safety net)
    let safetyNet = ""
    try {
      const snap = await createBackup()
      safetyNet = ` Snapshot otomatis sebelum restore: ${snap.filename}.`
    } catch {
      safetyNet = " (Snapshot otomatis gagal dibuat.)"
    }
    await restoreBackup(filename)
    await logActivity("update", "DatabaseBackup", 0, `Restore database dari: ${filename}`)
    revalidatePath("/pengaturan/database")
    return { success: true, message: `Database berhasil di-restore dari ${filename}.${safetyNet}` }
  } catch (e) {
    return { success: false, message: getErrorMessage(e) || "Gagal restore database" }
  }
}

export async function deleteDatabaseBackup(filename: string): Promise<BackupResult> {
  try {
    await requirePermission("manage_settings")
    await deleteBackup(filename)
    await logActivity("delete", "DatabaseBackup", 0, `Menghapus backup: ${filename}`)
    revalidatePath("/pengaturan/database")
    return { success: true, message: "Backup berhasil dihapus" }
  } catch (e) {
    return { success: false, message: getErrorMessage(e) || "Gagal menghapus backup" }
  }
}
