import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-response";
import { getDailyAttendanceMetrics } from "@/lib/services/daily-attendance.service";

export async function GET() {
  try {
    const user = await requireAuth();
    const userId = Number(user.id);
    const [canViewItems, canViewInvoices, canViewAttendance, canViewActivity] =
      await Promise.all([
        hasPermission("view_items"),
        hasPermission("view_sales_invoices"),
        hasPermission("view_attendance"),
        Promise.resolve(
          user.roles.includes("super_admin") || user.roles.includes("admin"),
        ),
      ]);
    // Approval totals span all modules. Don't reveal the global queue count to
    // users who can only see their own module data.
    const canViewApprovalQueue =
      user.roles.includes("super_admin") ||
      user.permissions.includes("approve_workflows") ||
      user.permissions.includes("manage_settings");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      lowStockCount,
      overdueInvoiceCount,
      pendingApprovalCount,
      attendanceMetrics,
      recentActivities,
      latestNotifications,
    ] = await Promise.all([
      canViewItems
        ? prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM items
        WHERE is_active = true AND deleted_at IS NULL
          AND min_stock > 0 AND qty_on_hand <= min_stock
      `
        : Promise.resolve([{ count: BigInt(0) }] as [{ count: bigint }]),
      canViewInvoices
        ? prisma.salesInvoice.count({
            where: {
              dueDate: { lt: today },
              paymentStatus: { not: "paid" },
              status: { not: "cancelled" },
              deletedAt: null,
            },
          })
        : Promise.resolve(0),
      canViewApprovalQueue
        ? prisma.approval.count({ where: { status: "pending" } })
        : Promise.resolve(0),
      canViewAttendance
        ? getDailyAttendanceMetrics(today)
        : Promise.resolve({ lateAttendanceCount: 0, absentEmployees: [] }),
      canViewActivity
        ? prisma.activityLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              action: true,
              modelType: true,
              description: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          body: true,
          type: true,
          readAt: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      lowStockCount: Number(lowStockCount[0]?.count ?? 0),
      overdueInvoiceCount,
      pendingApprovalCount,
      lateAttendanceCount: attendanceMetrics.lateAttendanceCount,
      absentEmployeeCount:
        canViewAttendance && new Date().getHours() >= 10
          ? attendanceMetrics.absentEmployees.length
          : 0,
      recentActivities: recentActivities.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      latestNotifications: latestNotifications.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (
      msg.includes("Unauthorized") ||
      msg.includes("Silakan login") ||
      msg.includes("auth")
    ) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }
    console.error("Dashboard notifications error:", e);
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server");
  }
}
