import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { apiError } from "@/lib/api-response"
import { notificationService } from "@/lib/services/notification.service"
import { assertCSRF } from "@/lib/security/csrf"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return apiError("UNAUTHORIZED", "Tidak terotorisasi")
    await assertCSRF()

    const { id } = await params
    const notificationId = Number(id)
    const userId = Number(session.user.id)
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(notificationId) || notificationId <= 0) return apiError("BAD_REQUEST", "Invalid notification id")
    if (!Number.isSafeInteger(userId) || userId <= 0) return apiError("BAD_REQUEST", "Invalid user")

    // Security: scope the update to the caller's userId inside the service.
    // `markAsRead` returns false both for missing notifications and
    // notifications owned by other users, so we return 404 for both — the
    // response shape doesn't leak existence to a probing attacker.
    const ok = await notificationService.markAsRead(notificationId, userId)
    if (!ok) return apiError("NOT_FOUND", "Not found")

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CSRF validation failed:")) {
      return apiError("FORBIDDEN", "Permintaan lintas situs ditolak")
    }
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
