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
  const file = formData.get("file") as File | null
  const referenceType = formData.get("referenceType") as string | null
  const referenceId = formData.get("referenceId") as string | null

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  }

  if (!referenceType || !referenceId) {
    return NextResponse.json({ error: "referenceType and referenceId are required" }, { status: 400 })
  }

  // Validate file type
  const allowedTypes = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
  ]
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Format file tidak didukung. Gunakan JPG, PNG, WebP, GIF, atau PDF." }, { status: 400 })
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Ukuran file maksimal 10MB" }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Save to public/uploads/attachments/{referenceType}
  const uploadDir = path.join(process.cwd(), "public", "uploads", "attachments", referenceType)
  await mkdir(uploadDir, { recursive: true })

  const ext = file.name.split(".").pop() || "bin"
  const filename = `${referenceType}-${referenceId}-${Date.now()}.${ext}`
  const filepath = path.join(uploadDir, filename)

  await writeFile(filepath, buffer)

  const fileUrl = `/uploads/attachments/${referenceType}/${filename}`

  // Save to database
  const attachment = await prisma.transactionAttachment.create({
    data: {
      referenceType,
      referenceId: Number(referenceId),
      filename,
      originalName: file.name,
      fileUrl,
      fileSize: file.size,
      mimeType: file.type,
      uploadedBy: Number(session.user.id),
    },
  })

  return NextResponse.json(attachment)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const referenceType = searchParams.get("referenceType")
  const referenceId = searchParams.get("referenceId")

  if (!referenceType || !referenceId) {
    return NextResponse.json({ error: "referenceType and referenceId are required" }, { status: 400 })
  }

  const attachments = await prisma.transactionAttachment.findMany({
    where: {
      referenceType,
      referenceId: Number(referenceId),
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(attachments)
}
