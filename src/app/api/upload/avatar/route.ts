import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("avatar") as File | null

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Format file tidak didukung. Gunakan JPG, PNG, WebP, atau GIF." }, { status: 400 })
  }

  // Validate file size (max 2MB)
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "Ukuran file maksimal 50MB" }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Save to public/uploads/avatars
  const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars")
  await mkdir(uploadDir, { recursive: true })

  // Sanitize extension
  const rawExt = (file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "")
  const ext = rawExt.slice(0, 10) || "jpg"
  const filename = `user-${session.user.id}-${Date.now()}.${ext}`
  const filepath = path.join(uploadDir, filename)

  await writeFile(filepath, buffer)

  const avatarUrl = `/uploads/avatars/${filename}`

  const userId = Number.parseInt(String(session.user.id), 10)
  if (!Number.isInteger(userId) || userId <= 0) return NextResponse.json({ error: "Invalid user" }, { status: 400 })

  // Update user avatar in database
  await prisma.user.update({
    where: { id: userId },
    data: { avatar: avatarUrl },
  })

  return NextResponse.json({ url: avatarUrl })
}
