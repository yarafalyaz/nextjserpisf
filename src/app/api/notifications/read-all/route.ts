import { NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { apiError } from "@/lib/api-response"
import { notificationService } from "@/lib/services/notification.service"
import { assertCSRF } from "@/lib/security/csrf"

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user || session.user.isActive === false) {
      return apiError("UNAUTHORIZED", "Tidak terotorisasi")
    }
    await assertCSRF()

    const userId = Number(session.user.id)
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return apiError("BAD_REQUEST", "Pengguna tidak valid")
    }

    await notificationService.markAllAsRead(userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CSRF validation failed:")) {
      return apiError("FORBIDDEN", "Permintaan lintas situs ditolak")
    }
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
