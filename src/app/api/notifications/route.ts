import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const notifications = await prisma.notification.findMany({
    where: { userId: Number(session.user.id) },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  const unreadCount = await prisma.notification.count({
    where: { userId: Number(session.user.id), readAt: null },
  })

  return NextResponse.json({ notifications, unreadCount })
}
