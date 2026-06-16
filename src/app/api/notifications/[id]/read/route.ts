import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { apiError } from "@/lib/api-response"
import { notificationService } from "@/lib/services/notification.service"

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

    // Security: scope the update to the caller's userId inside the service.
    // `markAsRead` returns false both for missing notifications and
    // notifications owned by other users, so we return 404 for both — the
    // response shape doesn't leak existence to a probing attacker.
    const ok = await notificationService.markAsRead(notificationId, userId)
    if (!ok) return apiError("NOT_FOUND", "Not found")

    return NextResponse.json({ success: true })
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
