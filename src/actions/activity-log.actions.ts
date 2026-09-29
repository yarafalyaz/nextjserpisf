"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"

export async function clearActivityLog() {
  await requirePermission("manage_settings")

  const count = await prisma.activityLog.deleteMany()

  await logActivity(
    "delete",
    "ActivityLog",
    0,
    `Menghapus ${count.count} log aktivitas`,
  )

  revalidatePath("/pengaturan/log-aktivitas")
}
