import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { requireAuth } from "@/lib/auth/permissions"

export async function GET() {
  try {
    const user = await requireAuth()
    const userId = Number(user.id)
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
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM items
        WHERE is_active = true AND deleted_at IS NULL
          AND min_stock > 0 AND qty_on_hand <= min_stock
      `,
      prisma.salesInvoice.count({
        where: {
          dueDate: { lt: new Date() },
          paymentStatus: { not: "paid" },
          deletedAt: null,
        },
      }),
      Promise.resolve(0),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM attendances
        WHERE date >= CURDATE() AND date < CURDATE() + INTERVAL 1 DAY
          AND (status = 'late' OR late_minutes > 0)
      `,
      (async () => {
        if (new Date().getHours() < 10) return 0
        const [active, present, onLeave, holiday] = await Promise.all([
          prisma.employee.count({ where: { isActive: true, deletedAt: null } }),
          prisma.attendance.count({ where: { date: { gte: today, lt: tomorrow } } }),
          prisma.leaveRequest.count({ where: { status: "approved", startDate: { lte: today }, endDate: { gte: today } } }),
          prisma.holiday.findFirst({ where: { date: today }, select: { id: true } }),
        ])
        if (holiday) return 0
        return Math.max(0, active - present - onLeave)
      })(),
      prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          action: true,
          modelType: true,
          description: true,
          createdAt: true,
        },
      }),
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
