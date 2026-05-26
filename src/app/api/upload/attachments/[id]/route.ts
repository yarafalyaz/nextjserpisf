import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { unlink } from "fs/promises"
import path from "path"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const attachment = await prisma.transactionAttachment.findUnique({
    where: { id: Number(id) },
  })

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 })
  }

  // Delete file from disk
  try {
    const filepath = path.join(process.cwd(), "public", attachment.fileUrl)
    await unlink(filepath)
  } catch {
    // File might already be deleted, continue
  }

  // Delete from database
  await prisma.transactionAttachment.delete({
    where: { id: Number(id) },
  })

  return NextResponse.json({ success: true })
}
