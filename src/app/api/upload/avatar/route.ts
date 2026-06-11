import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { uploadToStorage } from "@/lib/storage/storage"

/**
 * Avatar upload — stores to the "avatars" category AND updates the current
 * user's profile avatar. Use the generic /api/upload route for logos,
 * signatures, and other assets that must NOT touch user.avatar.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Tidak terotorisasi" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = (formData.get("avatar") || formData.get("file")) as File | null

  if (!file) {
    return NextResponse.json({ error: "Tidak ada file diunggah" }, { status: 400 })
  }

  const userId = Number.parseInt(String(session.user.id), 10)
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "User tidak valid" }, { status: 400 })
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
    return NextResponse.json({ error: "Upload gagal" }, { status: 400 })
  }
}
