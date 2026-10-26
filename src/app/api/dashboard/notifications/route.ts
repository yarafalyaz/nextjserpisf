import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-response";
import { getDailyAttendanceMetrics } from "@/lib/services/daily-attendance.service";
import { resolveActivityReferenceLabels, resolveActivityReferenceSlugs } from "@/lib/services/activity-reference.service";
import { activityEntityHref } from "@/lib/utils/activity-href";
import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status";

export async function GET() {
  try {
    // Route API wajib balas 401 JSON saat tanpa sesi — requireAuth() melempar
    // redirect next/navigation (/login) yang di sini jadi 500/redirect HTML,
    // bukan kontrak { error: { code } }. Pola auth()+apiError sama dengan
    // route API lain (activity-logs, notifications, print, workflow).
    const session = await auth();
    const user = session?.user;
    if (!user || user.isActive === false) {
      return apiError("UNAUTHORIZED", "Tidak terotorisasi");
    }
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
              // Q-SIQ-6: hanya piutang yang sudah diakui; draft/approved/sent
              // belum terbit tidak boleh terhitung jatuh tempo.
              status: { in: [...RECOGNISED_AR_STATUSES] },
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
            where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
            take: 10,
            select: {
              id: true,
              action: true,
              modelType: true,
              modelId: true,
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

    // Sembunyikan baris yang record-nya sudah terhapus + beri link ke sisanya.
    // Baris yatim (ref tak teresolusi) hanya jejak audit — tempatnya di halaman
    // log-aktivitas, bukan widget ringkas dashboard.
    const refLabels = await resolveActivityReferenceLabels(
      recentActivities.map((a) => ({ modelType: a.modelType, modelId: a.modelId })),
    );
    const refSlugs = await resolveActivityReferenceSlugs(
      recentActivities.map((a) => ({ modelType: a.modelType, modelId: a.modelId })),
    );
    const liveActivities = recentActivities
      .map((a) => {
        const key = a.modelId != null ? `${a.modelType}:${a.modelId}` : null;
        const refLabel = key ? (refLabels.get(key) ?? null) : null;
        const href =
          a.modelId != null
            ? activityEntityHref(a.modelType, a.modelId, key ? refSlugs.get(key) : null)
            : null;
        return { ...a, refLabel, href };
      })
      .filter((a) => a.refLabel !== null || a.modelId == null)
      .slice(0, 5);

    return NextResponse.json({
      lowStockCount: Number(lowStockCount[0]?.count ?? 0),
      overdueInvoiceCount,
      pendingApprovalCount,
      lateAttendanceCount: attendanceMetrics.lateAttendanceCount,
      absentEmployeeCount:
        canViewAttendance && new Date().getHours() >= 10
          ? attendanceMetrics.absentEmployees.length
          : 0,
      recentActivities: liveActivities.map((a) => ({
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
    console.error("Dashboard notifications error:", e);
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server");
  }
}
