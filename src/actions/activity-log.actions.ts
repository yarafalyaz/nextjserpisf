"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"

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
  await requirePermission("manage_settings")

  const count = await prisma.activityLog.count()

  // 1. Append the purge record BEFORE deleting. logActivity stamps the acting
  //    user from the session, so this row is the durable proof of the purge.
  await logActivity(
    "purge",
    "ActivityLog",
    0,
    `Mengosongkan ${count} log aktivitas`,
  )

  // 2. Delete everything except the append-only "purge" audit records.
  const result = await prisma.activityLog.deleteMany({
    where: { action: { not: "purge" } },
  })

  revalidatePath("/pengaturan/log-aktivitas")
  return { deleted: result.count }
}

