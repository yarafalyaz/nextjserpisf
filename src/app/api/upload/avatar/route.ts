import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { uploadToStorage } from "@/lib/storage/storage"
import { apiError } from "@/lib/api-response"

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

  const formData = await req.formData()
  const file = (formData.get("avatar") || formData.get("file")) as File | null

  if (!file) {
    return apiError("BAD_REQUEST", "Tidak ada file diunggah")
  }

  const userId = Number.parseInt(String(session.user.id), 10)
  if (!Number.isInteger(userId) || userId <= 0) {
    return apiError("BAD_REQUEST", "User tidak valid")
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
