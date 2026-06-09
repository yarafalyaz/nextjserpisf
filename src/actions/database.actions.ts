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
  pruneAutoSnapshots,
  type BackupFile,
} from "@/lib/db/backup"

export type BackupResult = { success: boolean; message: string }

/** Sanitize filename to prevent path traversal */
function sanitizeFilename(filename: string): string {
  // Strip any directory components — only allow base filename
  const base = filename.replace(/^.*[\\/]/, "").replace(/\.\./g, "")
  if (!base || base !== filename) {
    throw new Error("Nama file tidak valid")
  }
  return base
}

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

export async function restoreDatabaseBackup(
  filename: string,
  withSnapshot: boolean = true
): Promise<BackupResult> {
  try {
    await requirePermission("manage_settings")
    const safeFilename = sanitizeFilename(filename)
    let safetyNet = ""
    if (withSnapshot) {
      try {
        // Keep only the latest auto-snapshot so the list doesn't pile up.
        await pruneAutoSnapshots()
        const snap = await createBackup("autosnap")
        safetyNet = ` Snapshot otomatis: ${snap.filename}.`
      } catch {
        safetyNet = " (Snapshot otomatis gagal dibuat.)"
      }
    }
    await restoreBackup(safeFilename)
    await logActivity("update", "DatabaseBackup", 0, `Restore database dari: ${safeFilename}`)
    revalidatePath("/pengaturan/database")
    return { success: true, message: `Database berhasil di-restore dari ${safeFilename}.${safetyNet}` }
  } catch (e) {
    return { success: false, message: getErrorMessage(e) || "Gagal restore database" }
  }
}

export async function deleteDatabaseBackup(filename: string): Promise<BackupResult> {
  try {
    await requirePermission("manage_settings")
    const safeFilename = sanitizeFilename(filename)
    await deleteBackup(safeFilename)
    await logActivity("delete", "DatabaseBackup", 0, `Menghapus backup: ${safeFilename}`)
    revalidatePath("/pengaturan/database")
    return { success: true, message: "Backup berhasil dihapus" }
  } catch (e) {
    return { success: false, message: getErrorMessage(e) || "Gagal menghapus backup" }
  }
}
