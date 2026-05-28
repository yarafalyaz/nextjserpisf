import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { requireAuth } from "@/lib/auth/permissions"

export async function GET() {
  try {
    await requireAuth()

    const [lowStockCount, overdueInvoiceCount, pendingApprovalCount, recentActivities] = await Promise.all([
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
      // Pending approvals — adjust if you have a specific approval workflow
      Promise.resolve(0),
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
    ])

    return NextResponse.json({
      lowStockCount: Number(lowStockCount[0]?.count ?? 0),
      overdueInvoiceCount,
      pendingApprovalCount,
      recentActivities: recentActivities.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
    })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
