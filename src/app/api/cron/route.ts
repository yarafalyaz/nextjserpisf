import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
import { notificationService } from "@/lib/services/notification.service"

const TASKS = [
  "lock-period",
  "low-stock",
  "overdue-invoice",
  "late-checkin",
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const taskParam = url.searchParams.get("task") as Task | null

  const tasksToRun: Task[] =
    taskParam && TASKS.includes(taskParam as Task)
      ? [taskParam as Task]
      : [...TASKS]

  const results: Record<string, { status: string; message?: string; duration: number }> = {}

  for (const task of tasksToRun) {
    const start = Date.now()
    try {
      const result = await runTask(task)
      const duration = Date.now() - start
      results[task] = { status: "success", message: result, duration }

      await prisma.cronLog.create({
        data: {
          task,
          status: "success",
          message: result,
          duration,
        },
      })
    } catch (e) {
      const duration = Date.now() - start
      const message = e instanceof Error ? e.message : "Unknown error"
      results[task] = { status: "error", message, duration }

      await prisma.cronLog.create({
        data: {
          task,
          status: "error",
          message,
          duration,
        },
      })
    }
  }

  return NextResponse.json({ results })
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

  // Check if there are any transactions in the current (next) month
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const hasTransactions = await prisma.salesInvoice.findFirst({
    where: {
      date: { gte: nextMonthStart, lte: nextMonthEnd },
    },
    select: { id: true },
  })

  if (hasTransactions) {
    // Don't lock if there are transactions in the next period
    const setting = await prisma.systemSetting.findFirst()
    if (setting) {
      return `Period belum dikunci — ada transaksi di bulan depan (${now.getMonth() + 1}/${now.getFullYear()})`
    }
  }

  const setting = await prisma.systemSetting.findFirst()
  if (!setting) {
    throw new Error("SystemSetting tidak ditemukan")
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

  for (const item of items) {
    await notificationService.checkAndNotifyLowStock({
      id: item.id,
      name: item.name,
      qtyOnHand: Number(item.qty_on_hand),
      minStock: Number(item.min_stock),
    })
  }

  return `${items.length} item di bawah stok minimum — notifikasi dikirim ke admin`
}

// 3. Overdue Invoice Alert
async function taskOverdueInvoiceAlert(): Promise<string> {
  const now = new Date()

  const overdueInvoices = await prisma.salesInvoice.findMany({
    where: {
      dueDate: { lt: now },
      paymentStatus: { not: "paid" },
      deletedAt: null,
    },
    include: { customer: { select: { name: true } } },
    take: 20,
  })

  if (overdueInvoices.length === 0) {
    return "Tidak ada invoice overdue"
  }

  const invoiceList = overdueInvoices
    .slice(0, 5)
    .map((i) => `${i.documentNo} (${i.customer?.name ?? "-"})`)
    .join(", ")
  const suffix = overdueInvoices.length > 5 ? ` dan ${overdueInvoices.length - 5} lainnya` : ""
  const totalOverdue = overdueInvoices.reduce(
    (sum, inv) => sum + (Number(inv.grandTotal) - Number(inv.paidAmount)),
    0
  )

  await notificationService.notifyAdmins(
    `${overdueInvoices.length} Invoice Jatuh Tempo`,
    `Total piutang overdue: Rp ${totalOverdue.toLocaleString("id-ID")}. Invoice: ${invoiceList}${suffix}`,
    "danger"
  )

  return `${overdueInvoices.length} invoice overdue — notifikasi dikirim ke admin`
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
    orderBy: { checkIn: "asc" },
    take: 20,
  })

  if (lateAttendances.length === 0) {
    return "Tidak ada keterlambatan check-in hari ini"
  }

  for (const attendance of lateAttendances) {
    if (!attendance.employee) continue
    const checkInTime = attendance.checkIn
      ? new Date(attendance.checkIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
      : "-"

    await notificationService.notifyLateCheckIn(
      {
        id: attendance.employee.id,
        name: attendance.employee.name,
        departmentName: attendance.employee.department?.name,
      },
      checkInTime
    )
  }

  return `${lateAttendances.length} karyawan telat — notifikasi dikirim ke admin`
}

// 5. Cleanup Old Sessions
async function taskCleanup(): Promise<string> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const result = await prisma.activityLog.deleteMany({
    where: {
      createdAt: { lt: ninetyDaysAgo },
    },
  })

  return `${result.count} log activity (>90 hari) dihapus`
}
