import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
import { notificationService } from "@/lib/services/notification.service"
import { apiError } from "@/lib/api-response"
import { pruneIdempotencyKeys } from "@/lib/utils/idempotency"

const TASKS = [
  "lock-period",
  "low-stock",
  "overdue-invoice",
  "late-checkin",
  "recover-stuck-reversals",
  "cleanup",
] as const

type Task = (typeof TASKS)[number]

export async function GET(request: Request) {
  return handleCron(request)
}

export async function POST(request: Request) {
  return handleCron(request)
}

async function handleCron(request: Request) {
  if (!isValidCronRequest(request)) {
    return apiError("UNAUTHORIZED", "Unauthorized")
  }

  const url = new URL(request.url)
  const rawTask = url.searchParams.get("task")
  if (rawTask !== null && (!rawTask || !TASKS.includes(rawTask as Task))) {
    return apiError("BAD_REQUEST", `Task cron tidak dikenal: ${rawTask}`)
  }
  const taskParam = rawTask as Task | null

  const tasksToRun: Task[] =
    taskParam
      ? [taskParam]
      : [...TASKS]

  const results: Record<string, { status: string; message?: string; duration: number }> = {}

  for (const task of tasksToRun) {
    const start = Date.now()
    try {
      const result = await runTask(task)
      const duration = Date.now() - start
      results[task] = { status: "success", message: result, duration }

      await logCronResult(task, "success", result, duration)
    } catch (e) {
      const duration = Date.now() - start
      const message = e instanceof Error ? e.message : "Unknown error"
      results[task] = { status: "error", message, duration }
      console.error(`Cron task "${task}" failed:`, e)

      await logCronResult(task, "error", message, duration)
    }
  }

  return NextResponse.json({ results })
}

async function logCronResult(
  task: Task,
  status: "success" | "error",
  message: string,
  duration: number
) {
  try {
    await prisma.cronLog.create({
      data: { task, status, message, duration },
    })
  } catch (e) {
    // Logging must never break the cron handler
    console.error(`Failed to write cronLog for task "${task}":`, e)
  }
}

async function runTask(task: Task): Promise<string> {
  switch (task) {
    case "lock-period":
      return await taskLockPeriod()
    case "low-stock":
      return await taskLowStockAlert()
    case "overdue-invoice":
      return await taskOverdueInvoiceAlert()
    case "late-checkin":
      return await taskLateCheckInAlert()
    case "recover-stuck-reversals":
      return await taskRecoverStuckReversals()
    case "cleanup":
      return await taskCleanup()
  }
}

// 1. Auto Lock Period
async function taskLockPeriod(): Promise<string> {
  const now = new Date()

  // Lock through the end of the PREVIOUS month relative to now (the just-closed
  // period). Running on the 1st of June → locks through 31 May. `new Date(year,
  // monthIndex, 0)` gives the last day of the month BEFORE monthIndex.
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  const setting = await prisma.systemSetting.findFirst()
  if (!setting) {
    throw new Error("SystemSetting tidak ditemukan")
  }

  // Monotonic guard: the auto-lock may only ADVANCE the lock date, never rewind
  // it. A manual edit can set periodLockDate to a future date (e.g. locking
  // through year-end, or closing a period early); the previous unconditional
  // update would then pull the lock back to "end of last month" on the next
  // cron run, silently REOPENING every period between the two dates and letting
  // back-dated entries into a period that had already been closed.
  const current = setting.periodLockDate
  if (current && new Date(current).getTime() >= periodEnd.getTime()) {
    return `Periode tetap dikunci hingga ${current.toLocaleDateString("id-ID")} (auto-lock tidak memundurkan kunci)`
  }

  await prisma.systemSetting.update({
    where: { id: setting.id },
    data: { periodLockDate: periodEnd },
  })

  return `Period dikunci hingga ${periodEnd.toLocaleDateString("id-ID")} (sebelumnya: ${setting.periodLockDate?.toLocaleDateString("id-ID") || "belum di-set"})`
}

// 2. Low Stock Alert
async function taskLowStockAlert(): Promise<string> {
  const items = await prisma.$queryRaw<
    { id: number; name: string; sku: string; qty_on_hand: number; min_stock: number }[]
  >`
    SELECT id, name, sku, qty_on_hand, min_stock
    FROM items
    WHERE is_active = true
      AND deleted_at IS NULL
      AND min_stock > 0
      AND qty_on_hand <= min_stock
  `

  if (items.length === 0) {
    return "Semua stok aman"
  }

  await notificationService.checkAndNotifyLowStockBatch(
    items.map((item) => ({
      id: item.id,
      name: item.name,
      qtyOnHand: Number(item.qty_on_hand),
      minStock: Number(item.min_stock),
    })),
  )

  return `${items.length} item di bawah stok minimum — notifikasi dikirim ke admin`
}

// 3. Overdue Invoice Alert
async function taskOverdueInvoiceAlert(): Promise<string> {
  const now = new Date()

  const where: Prisma.SalesInvoiceWhereInput = {
    dueDate: { lt: now },
    paymentStatus: { not: "paid" },
    // Cancelling an invoice sets paymentStatus "cancelled" (not "paid"), so it
    // would otherwise still match and inflate the count/total + fire false
    // overdue alerts. Mirrors the daily-notifications cron's exclusion.
    status: { not: "cancelled" },
    deletedAt: null,
  }
  const [summary, overdueInvoices] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where,
      _count: { _all: true },
      _sum: { grandTotal: true, paidAmount: true },
    }),
    prisma.salesInvoice.findMany({
      where,
      include: { customer: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 5,
    }),
  ])

  const overdueCount = summary._count._all
  if (overdueCount === 0) {
    return "Tidak ada invoice overdue"
  }

  const invoiceList = overdueInvoices
    .slice(0, 5)
    .map((i) => `${i.documentNo} (${i.customer?.name ?? "-"})`)
    .join(", ")
  const suffix = overdueCount > overdueInvoices.length
    ? ` dan ${overdueCount - overdueInvoices.length} lainnya`
    : ""
  const totalOverdue = Number(summary._sum.grandTotal ?? 0) - Number(summary._sum.paidAmount ?? 0)

  await notificationService.notifyAdmins(
    `${overdueCount} Invoice Jatuh Tempo`,
    `Total piutang overdue: Rp ${totalOverdue.toLocaleString("id-ID")}. Invoice: ${invoiceList}${suffix}`,
    "danger"
  )

  return `${overdueCount} invoice overdue — notifikasi dikirim ke admin`
}

// 4. Late Check-in Alert
async function taskLateCheckInAlert(): Promise<string> {
  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(now)
  dayEnd.setHours(23, 59, 59, 999)

  const lateAttendances = await prisma.attendance.findMany({
    where: {
      date: { gte: dayStart, lte: dayEnd },
      OR: [
        { status: "late" },
        { lateMinutes: { gt: 0 } },
      ],
    },
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ checkIn: "asc" }, { id: "asc" }],
  })

  if (lateAttendances.length === 0) {
    return "Tidak ada keterlambatan check-in hari ini"
  }

  // Pre-format check-in times once. Filter out rows with a null employee
  // (defensive: an attendance row whose employee was deleted) so the batched
  // call only sees the rows we'd actually notify on.
  const entries = lateAttendances.flatMap((attendance) => {
    if (!attendance.employee) return []
    return [{
      employee: {
        id: attendance.employee.id,
        name: attendance.employee.name,
        departmentName: attendance.employee.department?.name,
      },
      checkInTime: attendance.checkIn
        ? new Date(attendance.checkIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
        : "-",
    }]
  })

  if (entries.length > 0) {
    await notificationService.notifyLateCheckInBatch(entries)
  }

  return `${lateAttendances.length} karyawan telat — notifikasi dikirim ke admin`
}

// 5. Recover journals stuck in REVERSING
//
// reverseJournal() claims a journal by flipping POSTED -> REVERSING inside a
// transaction, then rolls the claim back to POSTED if anything fails. If the
// process dies between the claim and the completion, the journal stays
// REVERSING — a state the GL never reads (reports only sum POSTED/REVERSED), so
// the document silently disappears from the books while still existing. Return
// old claims to POSTED so an operator can retry the reversal.
const STUCK_REVERSING_MS = 15 * 60 * 1000

async function taskRecoverStuckReversals(): Promise<string> {
  const cutoff = new Date(Date.now() - STUCK_REVERSING_MS)

  const result = await prisma.journal.updateMany({
    where: { status: "REVERSING", updatedAt: { lt: cutoff } },
    data: { status: "POSTED" },
  })

  if (result.count === 0) {
    return "Tidak ada jurnal tertahan di REVERSING"
  }

  return `${result.count} jurnal dikembalikan dari REVERSING ke POSTED (tertahan >15 menit)`
}

// 6. Cleanup Old Sessions + expired idempotency keys
async function taskCleanup(): Promise<string> {
  // Activity-log retention. 90 days was far too short for an audit trail: the
  // GL needs many years of history for tax/external audit, and an automatically
  // vanishing trail is worse than none (it looks complete but isn't). Keep 2
  // years by default; adjust ACTIVITY_LOG_RETENTION_DAYS in the environment for
  // a longer/shorter window. "purge" records (who cleared the log) are NEVER
  // pruned — their meta-audit history is append-only.
  const retentionDays = Number(process.env.ACTIVITY_LOG_RETENTION_DAYS ?? 730)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 730))

  const result = await prisma.activityLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      action: { not: "purge" },
    },
  })

  // Idempotency keys are written by every guarded mutation and were never
  // removed, so the table grew without bound.
  const prunedKeys = await pruneIdempotencyKeys()

  return `${result.count} log activity (>${retentionDays} hari) dihapus, ${prunedKeys} kunci idempotency kedaluwarsa dihapus`
}
