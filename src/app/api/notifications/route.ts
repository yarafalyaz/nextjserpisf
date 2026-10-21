import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { apiError } from "@/lib/api-response"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return apiError("UNAUTHORIZED", "Tidak terotorisasi")

    const userIdRaw = String(session.user.id)
    if (!/^\d+$/.test(userIdRaw)) return apiError("BAD_REQUEST", "Pengguna tidak valid")
    const userId = Number(userIdRaw)
    if (!Number.isSafeInteger(userId) || userId <= 0) return apiError("BAD_REQUEST", "Pengguna tidak valid")

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        // Kontrak dropdown hanya butuh field ini; tanpa select, userId internal ikut bocor.
        select: {
          id: true,
          title: true,
          body: true,
          type: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ])

    return NextResponse.json({ notifications, unreadCount })
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
