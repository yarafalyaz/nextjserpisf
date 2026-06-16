import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { hasPermission, requireAuth } from "@/lib/auth/permissions"
import { apiError } from "@/lib/api-response"

export async function GET() {
  try {
    const user = await requireAuth()
    const userId = Number(user.id)
    const [canViewItems, canViewInvoices, canViewAttendance, canViewActivity] = await Promise.all([
      hasPermission("view_items"),
      hasPermission("view_sales_invoices"),
      hasPermission("view_attendance"),
      Promise.resolve(user.roles.includes("super_admin") || user.roles.includes("admin")),
    ])
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today.getTime() + 86400000)

    const [
      lowStockCount,
      overdueInvoiceCount,
      pendingApprovalCount,
      lateAttendanceCount,
      absentEmployeeCount,
      recentActivities,
      latestNotifications,
    ] = await Promise.all([
      canViewItems ? prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM items
        WHERE is_active = true AND deleted_at IS NULL
          AND min_stock > 0 AND qty_on_hand <= min_stock
      ` : Promise.resolve([{ count: BigInt(0) }] as [{ count: bigint }]),
      canViewInvoices ? prisma.salesInvoice.count({
        where: {
          dueDate: { lt: new Date() },
          paymentStatus: { not: "paid" },
          // Cancelled invoices are void; even if they retain a past due date
          // and unpaid paymentStatus (cancelled status short-circuits the
          // payment-state recalc), they must never inflate the overdue count.
          // Mirrors the daily-notifications cron filter to keep both views
          // consistent — previously a cancelled invoice would surface here
          // and overstate overdue accounts receivable to admins.
          status: { not: "cancelled" },
          deletedAt: null,
        },
      }) : Promise.resolve(0),
      Promise.resolve(0),
      canViewAttendance ? prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM attendances
        WHERE date >= CURDATE() AND date < CURDATE() + INTERVAL 1 DAY
          AND (status = 'late' OR late_minutes > 0)
      ` : Promise.resolve([{ count: BigInt(0) }] as [{ count: bigint }]),
      canViewAttendance ? (async () => {
        if (new Date().getHours() < 10) return 0
        // Skip on weekends (no work schedule applied yet → use calendar
        // weekend as the safe default). Mirrors the daily-notifications cron
        // holiday-skip so both views stay consistent. WorkSchedule-aware
        // filtering can be added later; for now, count absent only on
        // Mon-Fri non-holiday weekdays.
        const day = new Date().getDay()
        if (day === 0 || day === 6) return 0
        const [active, present, onLeave, holiday] = await Promise.all([
          prisma.employee.count({ where: { isActive: true, deletedAt: null } }),
          prisma.attendance.count({ where: { date: { gte: today, lt: tomorrow } } }),
          prisma.leaveRequest.count({ where: { status: "approved", startDate: { lte: today }, endDate: { gte: today } } }),
          prisma.holiday.findFirst({ where: { date: today }, select: { id: true } }),
        ])
        if (holiday) return 0
        return Math.max(0, active - present - onLeave)
      })() : Promise.resolve(0),
      canViewActivity ? prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          action: true,
          modelType: true,
          description: true,
          createdAt: true,
        },
      }) : Promise.resolve([]),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, body: true, type: true, readAt: true, createdAt: true },
      }),
    ])

    return NextResponse.json({
      lowStockCount: Number(lowStockCount[0]?.count ?? 0),
      overdueInvoiceCount,
      pendingApprovalCount,
      lateAttendanceCount: Number(lateAttendanceCount[0]?.count ?? 0),
      absentEmployeeCount,
      recentActivities: recentActivities.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      latestNotifications: latestNotifications.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
      })),
    })
  } catch {
    return apiError("UNAUTHORIZED", "Unauthorized")
  }
}
