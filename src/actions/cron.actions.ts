"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"

export async function runCronTask(task: string) {
  await requirePermission("manage_settings")

  const CRON_SECRET = process.env.CRON_SECRET
  if (!CRON_SECRET) {
    throw new Error("CRON_SECRET belum di-set")
  }

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
  const res = await fetch(`${baseUrl}/api/cron?task=${task}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
    cache: "no-store",
  })

  const data = await res.json()

  revalidatePath("/pengaturan/cron")

  return data
}

export async function getCronLogs() {
  await requirePermission("manage_settings")

  const logs = await prisma.cronLog.findMany({
    orderBy: { ranAt: "desc" },
    take: 50,
  })

  return logs
}
