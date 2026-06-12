import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { apiError } from "@/lib/api-response"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return apiError("UNAUTHORIZED", "Tidak terotorisasi")

    const userId = Number.parseInt(String(session.user.id), 10)
    if (!Number.isInteger(userId) || userId <= 0) return apiError("BAD_REQUEST", "Invalid user")

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    })

    const unreadCount = await prisma.notification.count({
      where: { userId, readAt: null },
    })

    return NextResponse.json({ notifications, unreadCount })
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
