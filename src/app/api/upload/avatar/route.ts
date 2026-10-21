import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { uploadToStorage } from "@/lib/storage/storage"
import { apiError } from "@/lib/api-response"
import { assertCSRF } from "@/lib/security/csrf"

/**
 * Avatar upload — stores to the "avatars" category AND updates the current
 * user's profile avatar. Use the generic /api/upload route for logos,
 * signatures, and other assets that must NOT touch user.avatar.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }
  try {
    await assertCSRF()
  } catch {
    return apiError("FORBIDDEN", "Permintaan lintas situs ditolak")
  }

  const formData = await req.formData()
  const file = (formData.get("avatar") || formData.get("file")) as File | null

  if (!file) {
    return apiError("BAD_REQUEST", "Tidak ada file diunggah")
  }

  const userIdRaw = String(session.user.id)
  if (!/^\d+$/.test(userIdRaw)) {
    return apiError("BAD_REQUEST", "Pengguna tidak valid")
  }
  const userId = Number(userIdRaw)
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return apiError("BAD_REQUEST", "Pengguna tidak valid")
  }

  try {
    const { url } = await uploadToStorage(file, {
      category: "avatars",
      prefix: `user-${userId}`,
      maxBytes: 2 * 1024 * 1024,
    })

    await prisma.user.update({
      where: { id: userId },
      data: { avatar: url },
    })

    return NextResponse.json({ url })
  } catch (e) {
    console.error("Avatar upload failed:", e)
    return apiError("BAD_REQUEST", "Upload gagal")
  }
}
