import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { parsePagination } from "@/lib/utils/pagination"
import { apiError } from "@/lib/api-response"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user)
      return apiError("UNAUTHORIZED", "Tidak terotorisasi")

    const sp = req.nextUrl.searchParams
    const { page, pageSize, skip, take } = parsePagination({
      halaman: sp.get("halaman") ?? undefined,
      pageSize: sp.get("pageSize") ?? undefined,
    })

    // Filters
    const userId = sp.get("userId")
    const action = sp.get("action")
    const modelType = sp.get("modelType")
    const dateFrom = sp.get("dateFrom")
    const dateTo = sp.get("dateTo")
    const search = sp.get("cari")

    const where: Record<string, unknown> = {}

    if (userId && userId !== "all") {
      where.userId = Number.parseInt(userId, 10)
    }
    if (action && action !== "all") {
      where.action = action
    }
    if (modelType && modelType !== "all") {
      where.modelType = modelType
    }
    if (dateFrom || dateTo) {
      where.createdAt = {}
      const w = where.createdAt as Record<string, Date>
      if (dateFrom) w.gte = new Date(dateFrom)
      if (dateTo) {
        const d = new Date(dateTo)
        d.setHours(23, 59, 59, 999)
        w.lte = d
      }
    }
    if (search) {
      where.description = { contains: search }
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.activityLog.count({ where }),
    ])

    // Hydrate user names in one query
    const userIds = Array.from(
      new Set(logs.map((l) => l.userId).filter((id): id is number => id != null)),
    )
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : []
    const userMap = new Map(users.map((u) => [u.id, u.name]))

    return NextResponse.json({
      data: logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        userName: log.userId ? (userMap.get(log.userId) ?? "Pengguna") : "Sistem",
        action: log.action,
        modelType: log.modelType,
        modelId: log.modelId,
        description: log.description ?? "-",
        createdAt: log.createdAt.toISOString(),
        ipAddress: log.ipAddress ?? "-",
        oldValues: log.oldValues,
        newValues: log.newValues,
      })),
      total,
      page,
      pageSize,
    })
  } catch (e) {
    console.error("Activity logs API error:", e)
    return NextResponse.json(
      { error: "Gagal memuat log aktivitas" },
      { status: 500 },
    )
  }
}
