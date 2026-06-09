"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"

const ALLOWED_CRON_TASKS = [
  "lock-period",
  "low-stock",
  "overdue-invoice",
  "late-checkin",
  "cleanup",
] as const

export async function runCronTask(task: string) {
  await requirePermission("manage_settings")

  if (!ALLOWED_CRON_TASKS.includes(task as (typeof ALLOWED_CRON_TASKS)[number])) {
    throw new Error(`Task tidak diizinkan: ${task}`)
  }

  const cronEnv = process.env["CRON_CREDENTIAL"] || process.env["CRON_SECRET"]
  if (!cronEnv) {
    throw new Error("Credential cron belum di-set")
  }

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
  const res = await fetch(`${baseUrl}/api/cron?task=${encodeURIComponent(task)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cronEnv}` },
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
