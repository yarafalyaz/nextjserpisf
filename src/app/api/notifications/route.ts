import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Tidak terotorisasi" }, { status: 401 })

  const userId = Number.parseInt(String(session.user.id), 10)
  if (!Number.isInteger(userId) || userId <= 0) return NextResponse.json({ error: "Invalid user" }, { status: 400 })

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  const unreadCount = await prisma.notification.count({
    where: { userId, readAt: null },
  })

  return NextResponse.json({ notifications, unreadCount })
}
