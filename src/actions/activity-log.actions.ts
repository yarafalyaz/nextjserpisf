"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"

/**
 * Purge the activity log WITHOUT destroying the evidence that a purge happened.
 *
 * A plain `deleteMany()` erased the entire trail — including the row recording
 * who ran the purge — so an actor with `manage_settings` could wipe every trace
 * of their own activity and leave behind only an anonymous "someone deleted N
 * logs" marker. That is the opposite of an audit trail.
 *
 * Integrity contract (kept deliberately simple — no blockchain, no soft-delete
 * column needed):
 *   1. Record the purge FIRST, tagged with the dedicated action "purge", so the
 *      who/when/how-many survives the very deletion it describes.
 *   2. Delete every log EXCEPT rows whose action is "purge": the historical
 *      record of purges is append-only and can never be erased from the UI.
 * Processing history is wiped, but the meta-audit ("who cleared the log, when,
 * how many rows") is permanent.
 */
export async function clearActivityLog() {
  // Izin `manage_settings`, sama dengan proxy + halaman /pengaturan/log-aktivitas
  // (super_admin bypass).
  const actor = await requirePermission("manage_settings")

  // Putaran 77: hitung + baris purge + hapus dalam SATU tx. Jalur lama memakai
  // logActivity() yang MENELAN kegagalan tulis (catch-all di service), jadi
  // kegagalan insert purge tetap berlanjut ke deleteMany — jejak hilang tanpa
  // bukti purge. Di sini insert tulis langsung lewat tx dan mengecualikan
  // seluruh purge historis; aktifitas yang lahir di antara count dan delete
  // lama tak lagi terhapus tak terhitung.
  const deleted = await prisma.$transaction(async (tx) => {
    const count = await tx.activityLog.count()
    await tx.activityLog.create({
      data: {
        userId: Number(actor.id),
        action: "purge",
        modelType: "ActivityLog",
        modelId: 0,
        description: `Mengosongkan ${count} log aktivitas`,
      },
    })
    const result = await tx.activityLog.deleteMany({
      where: { action: { not: "purge" } },
    })
    return result.count
  })

  revalidatePath("/pengaturan/log-aktivitas")
  return { deleted }
}

