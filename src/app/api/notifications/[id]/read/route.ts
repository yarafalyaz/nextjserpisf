import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { apiError } from "@/lib/api-response"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return apiError("UNAUTHORIZED", "Tidak terotorisasi")

    const { id } = await params
    const notificationId = Number.parseInt(id, 10)
    const userId = Number.parseInt(String(session.user.id), 10)
    if (!Number.isInteger(notificationId) || notificationId <= 0) return apiError("BAD_REQUEST", "Invalid notification id")
    if (!Number.isInteger(userId) || userId <= 0) return apiError("BAD_REQUEST", "Invalid user")

    // Fix H1: verify ownership first — `id` is the PK so Prisma ignores the
    // userId filter in the update where-clause (IDOR). Use findFirst to assert
    // ownership, then update by PK.
    const own = await prisma.notification.findFirst({ where: { id: notificationId, userId }, select: { id: true } })
    if (!own) return apiError("NOT_FOUND", "Not found")

    await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
