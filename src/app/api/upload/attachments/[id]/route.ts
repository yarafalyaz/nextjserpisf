import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { apiError } from "@/lib/api-response"
import { unlink } from "fs/promises"
import path from "path"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  const { id } = await params
  const attachmentId = Number.parseInt(id, 10)
  const userId = Number.parseInt(String(session.user.id), 10)
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) return apiError("BAD_REQUEST", "Invalid attachment id")
  if (!Number.isInteger(userId) || userId <= 0) return apiError("BAD_REQUEST", "Invalid user")

  try {
    const attachment = await prisma.transactionAttachment.findUnique({
      where: { id: attachmentId },
    })

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 })
    }

    // Ownership guard: only uploader can delete
    if (attachment.uploadedBy !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Delete file from disk (normalize path)
    // Files are stored under private/uploads/attachments/ but fileUrl is the API
    // route path (/api/attachments/<ref>/<filename>). Resolve actual disk path.
    try {
      const filename = attachment.fileUrl.split("/").pop()
      const refType = attachment.referenceType || "general"
      const privateRoot = path.join(process.cwd(), "private", "uploads", "attachments", refType)
      const filepath = path.resolve(privateRoot, filename || "")
      const relative = path.relative(path.join(process.cwd(), "private", "uploads"), filepath)

      if (filename && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        await unlink(filepath)
      }
    } catch {
      // File might already be deleted or on R2, continue
    }

    // Delete from database
    await prisma.transactionAttachment.delete({
      where: { id: attachmentId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Gagal menghapus attachment" },
      { status: 500 }
    )
  }
}
