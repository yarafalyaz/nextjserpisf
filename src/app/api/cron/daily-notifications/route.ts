import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"

/**
 * Cron: Send daily notifications to admins.
 * Schedule: Daily at 07:00 (0 7 * * *)
 * 
 * Mirrors Laravel: SendDailyNotifications command
 * 
 * Checks:
 * - Low stock items (qty_on_hand <= min_stock)
 * - Overdue invoices (due_date < today, not fully paid)
 * - Pending POs older than 7 days
 * - Late attendance today
 */
export async function GET(request: Request) {
  // Verify cron secret
  if (!isValidCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get admin users
  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      roles: {
        some: {
          name: { in: ["super_admin", "admin"] },
        },
      },
    },
  })

  if (admins.length === 0) {
    return NextResponse.json({ message: "No active admins found." })
  }

  const results: Record<string, number> = {}

  // 1. Low stock items
  const lowStockItems = await prisma.$queryRaw<Array<{ id: number; name: string; qty_on_hand: number; min_stock: number }>>`
    SELECT id, name, qty_on_hand, min_stock 
    FROM items 
    WHERE is_active = true 
      AND min_stock > 0 
      AND qty_on_hand <= min_stock 
      AND deleted_at IS NULL
    LIMIT 20
  `

  if (lowStockItems.length > 0) {
    const count = lowStockItems.length
    const itemList = lowStockItems
      .slice(0, 5)
      .map((i) => `• ${i.name} (Stok: ${i.qty_on_hand}, Min: ${i.min_stock})`)
      .join("\n")

    const body = itemList + (count > 5 ? `\n...dan ${count - 5} lainnya` : "")

    // Fix #50: Use createMany instead of loop
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        title: `⚠️ ${count} Barang Stok Menipis`,
        body,
        type: "warning",
      })),
    })
    results.lowStock = count
  }

  // 2. Overdue invoices
  const overdueInvoices = await prisma.salesInvoice.findMany({
    where: {
      dueDate: { lt: today },
      status: { notIn: ["paid", "cancelled"] },
      deletedAt: null,
    },
    take: 20,
  })

  if (overdueInvoices.length > 0) {
    const count = overdueInvoices.length
    const totalOverdue = overdueInvoices.reduce(
      (sum, inv) => sum + (Number(inv.grandTotal) - Number(inv.paidAmount)),
      0
    )

    // Fix #50: Use createMany instead of loop
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        title: `🔴 ${count} Invoice Jatuh Tempo`,
        body: `Total piutang overdue: Rp ${totalOverdue.toLocaleString("id-ID")}`,
        type: "danger",
      })),
    })
    results.overdueInvoices = count
  }

  // 3. Pending POs older than 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const stalePOs = await prisma.purchaseOrder.findMany({
    where: {
      status: "ordered",
      createdAt: { lt: sevenDaysAgo },
      deletedAt: null,
    },
    take: 20,
  })

  if (stalePOs.length > 0) {
    const count = stalePOs.length

    // Fix #50: Use createMany instead of loop
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        title: `📦 ${count} PO Belum Diterima (>7 hari)`,
        body: `Ada ${count} pesanan pembelian yang sudah lebih dari 7 hari belum diterima barangnya.`,
        type: "warning",
      })),
    })
    results.stalePOs = count
  }

  // 4. Late attendance today
  const todayStr = today.toISOString().split("T")[0]
  const lateAttendances = await prisma.attendance.findMany({
    where: {
      date: {
        gte: new Date(`${todayStr}T00:00:00`),
        lt: new Date(`${todayStr}T23:59:59`),
      },
      status: "late",
    },
    include: { employee: true },
    take: 20,
  })

  if (lateAttendances.length > 0) {
    const count = lateAttendances.length
    const names = lateAttendances
      .slice(0, 5)
      .map((a) => `• ${a.employee?.name || "Unknown"}`)
      .join("\n")

    const body = names + (count > 5 ? `\n...dan ${count - 5} lainnya` : "")

    // Fix #50: Use createMany instead of loop
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        title: `⏰ ${count} Karyawan Telat Hari Ini`,
        body,
        type: "warning",
      })),
    })
    results.lateAttendance = count
  }

  return NextResponse.json({
    message: "Daily notifications sent.",
    adminsNotified: admins.length,
    results,
  })
}
