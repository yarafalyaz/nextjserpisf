import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"

const TASKS = [
  "lock-period",
  "low-stock",
  "overdue-invoice",
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
    case "cleanup":
      return await taskCleanup()
  }
}

// 1. Auto Lock Period
async function taskLockPeriod(): Promise<string> {
  const now = new Date()
  const day = now.getDate()
  const hour = now.getHours()

  // Only lock on the 1st of the month at ~00:00 (previous month end)
  // Or allow manual trigger any time
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 0) // last day of prev month
  const periodEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0, 23, 59, 59)

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
  const lowStockItems = await prisma.item.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      minStock: { gt: 0 },
      qtyOnHand: { lte: prisma.item.fields.qtyOnHand }, // raw comparison via SQL
    },
    select: { id: true, name: true, sku: true, qtyOnHand: true, minStock: true },
  })

  // Use raw query since Prisma Decimal comparison is tricky
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

  // Notify all users with items permission (simple: notify all active users)
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  const itemList = items.slice(0, 5).map((i) => `${i.name} (${i.qty_on_hand})`).join(", ")
  const suffix = items.length > 5 ? ` dan ${items.length - 5} lainnya` : ""

  for (const user of users) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "⚠️ Stok Menipis",
        body: `${items.length} item stok di bawah minimum: ${itemList}${suffix}`,
        type: "warning",
      },
    })
  }

  return `${items.length} item di bawah stok minimum — notifikasi dikirim ke ${users.length} user`
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
  })

  if (overdueInvoices.length === 0) {
    return "Tidak ada invoice overdue"
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  const invoiceList = overdueInvoices.slice(0, 5).map((i) => `${i.documentNo} (${i.customer.name})`).join(", ")
  const suffix = overdueInvoices.length > 5 ? ` dan ${overdueInvoices.length - 5} lainnya` : ""

  for (const user of users) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "🔴 Invoice Jatuh Tempo",
        body: `${overdueInvoices.length} invoice belum lunas: ${invoiceList}${suffix}`,
        type: "error",
      },
    })
  }

  return `${overdueInvoices.length} invoice overdue — notifikasi dikirim ke ${users.length} user`
}

// 4. Cleanup Old Sessions
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
