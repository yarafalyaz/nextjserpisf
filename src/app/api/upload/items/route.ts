import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("image") as File | null

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Format file tidak didukung. Gunakan JPG, PNG, WebP, atau GIF." }, { status: 400 })
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Ukuran file maksimal 5MB" }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Save to public/uploads/items
  const uploadDir = path.join(process.cwd(), "public", "uploads", "items")
  await mkdir(uploadDir, { recursive: true })

  const ext = file.name.split(".").pop() || "jpg"
  const filename = `item-${Date.now()}.${ext}`
  const filepath = path.join(uploadDir, filename)

  await writeFile(filepath, buffer)

  const imageUrl = `/uploads/items/${filename}`

  return NextResponse.json({ url: imageUrl })
}
