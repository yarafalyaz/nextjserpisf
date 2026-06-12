import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
import { notificationService } from "@/lib/services/notification.service"
import { apiError } from "@/lib/api-response"

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
 * - Absent employees after 10:00
 */
export async function GET(request: Request) {
  try {
  if (!isValidCronRequest(request)) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split("T")[0]
  const dayStart = new Date(`${todayStr}T00:00:00`)
  const dayEnd = new Date(`${todayStr}T23:59:59`)

  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      roles: { some: { name: { in: ["super_admin", "admin"] } } },
    },
    select: { id: true },
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

    await notificationService.notifyAdmins(
      `${count} Barang Stok Menipis`,
      itemList + (count > 5 ? `\n...dan ${count - 5} lainnya` : ""),
      "warning"
    )
    results.lowStock = count
  }

  // 2. Overdue invoices
  const overdueInvoices = await prisma.salesInvoice.findMany({
    where: {
      dueDate: { lt: today },
      paymentStatus: { not: "paid" },
      status: { not: "cancelled" },
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

    await notificationService.notifyAdmins(
      `${count} Invoice Jatuh Tempo`,
      `Total piutang overdue: Rp ${totalOverdue.toLocaleString("id-ID")}`,
      "danger"
    )
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
    await notificationService.notifyAdmins(
      `${count} PO Belum Diterima (>7 hari)`,
      `Ada ${count} pesanan pembelian yang sudah lebih dari 7 hari belum diterima barangnya.`,
      "warning"
    )
    results.stalePOs = count
  }

  // 4. Late attendance today
  const lateAttendances = await prisma.attendance.findMany({
    where: {
      date: { gte: dayStart, lt: dayEnd },
      OR: [{ status: "late" }, { lateMinutes: { gt: 0 } }],
    },
    include: { employee: { include: { department: true } } },
    take: 20,
  })

  if (lateAttendances.length > 0) {
    const count = lateAttendances.length
    const names = lateAttendances
      .slice(0, 5)
      .map((a) => `• ${a.employee?.name || "Unknown"}`)
      .join("\n")

    await notificationService.notifyAdmins(
      `${count} Karyawan Telat Hari Ini`,
      names + (count > 5 ? `\n...dan ${count - 5} lainnya` : ""),
      "warning"
    )
    results.lateAttendance = count
  }

  // 5. Absent employees (after 10 AM, skip holidays/leaves)
  if (new Date().getHours() >= 10) {
    const isHoliday = await prisma.holiday.findFirst({ where: { date: today }, select: { id: true } })

    if (!isHoliday) {
      const [activeEmployees, allAttendances, leaves] = await Promise.all([
        prisma.employee.findMany({
          where: { isActive: true, deletedAt: null },
          include: { department: true },
        }),
        prisma.attendance.findMany({
          where: { date: { gte: dayStart, lt: dayEnd } },
          select: { employeeId: true },
        }),
        prisma.leaveRequest.findMany({
          where: { status: "approved", startDate: { lte: today }, endDate: { gte: today } },
          select: { employeeId: true },
        }),
      ])

      const presentIds = new Set(allAttendances.map((a) => a.employeeId))
      const onLeaveIds = new Set(leaves.map((l) => l.employeeId))
      const absentEmployees = activeEmployees.filter((e) => !presentIds.has(e.id) && !onLeaveIds.has(e.id))

      if (absentEmployees.length > 0) {
        const count = absentEmployees.length
        const names = absentEmployees
          .slice(0, 5)
          .map((e) => `• ${e.name}${e.department ? ` (${e.department.name})` : ""}`)
          .join("\n")

        await notificationService.notifyAdmins(
          `${count} Karyawan Belum Absen`,
          names + (count > 5 ? `\n...dan ${count - 5} lainnya` : ""),
          "danger"
        )
        results.absentEmployees = count
      }
    }
  }

  return NextResponse.json({
    message: "Daily notifications sent.",
    adminsNotified: admins.length,
    results,
  })
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
