import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const notificationId = Number.parseInt(id, 10)
  const userId = Number.parseInt(String(session.user.id), 10)
  if (!Number.isInteger(notificationId) || notificationId <= 0) return NextResponse.json({ error: "Invalid notification id" }, { status: 400 })
  if (!Number.isInteger(userId) || userId <= 0) return NextResponse.json({ error: "Invalid user" }, { status: 400 })

  await prisma.notification.update({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
