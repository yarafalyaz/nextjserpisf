import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { canModifyAttachment } from "@/lib/auth/attachment-permissions"
import { apiError } from "@/lib/api-response"
import { unlink } from "fs/promises"
import path from "path"
import { assertCSRF } from "@/lib/security/csrf"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }
  try {
    await assertCSRF()
  } catch {
    return apiError("FORBIDDEN", "Permintaan lintas situs ditolak")
  }

  const { id } = await params
  const attachmentId = Number(id)
  const userId = Number(session.user.id)
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(attachmentId) || attachmentId <= 0) return apiError("BAD_REQUEST", "ID lampiran tidak valid")
  if (!Number.isSafeInteger(userId) || userId <= 0) return apiError("BAD_REQUEST", "Pengguna tidak valid")

  try {
    const attachment = await prisma.transactionAttachment.findUnique({
      where: { id: attachmentId },
    })

    if (!attachment) {
      return apiError("NOT_FOUND", "Lampiran tidak ditemukan")
    }

    // Ownership guard: only uploader can delete
    if (attachment.uploadedBy !== userId) {
      return apiError("FORBIDDEN", "Tidak memiliki izin")
    }
    if (!(await canModifyAttachment(attachment.referenceType, attachment.referenceId))) {
      return apiError("FORBIDDEN", "Tidak memiliki izin")
    }

    // Delete file from disk (normalize path)
    // Files are stored under private/uploads/attachments/ but fileUrl is the API
    // route path (/api/attachments/<ref>/<filename>). Resolve actual disk path.
    try {
      // fileUrl kanonis /api/attachments/<tipe>/<namaberkas> — tolak di
      // sumber bila tak cocok pola (split/pop meruntuhkan traversal).
      const match = /^\/api\/attachments\/[^/]+\/([^/]+)$/.exec(attachment.fileUrl)
      const filename = match?.[1] ?? ""
      // fileUrl tak cocok pola (mis. "/") atau mengandung traversal: lewati
      // unlink tapi LANJUT ke hapus baris DB — return telanjang di sini
      // membuat handler mengembalikan undefined (respons 500 tanpa badan).
      if (filename && !filename.includes("..")) {
        const refType = attachment.referenceType || "general"
        const privateRoot = path.join(process.cwd(), "private", "uploads", "attachments", refType)
        const filepath = path.resolve(privateRoot, filename)
        const relative = path.relative(path.join(process.cwd(), "private", "uploads"), filepath)

        if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
          await unlink(filepath)
        }
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
    return apiError("INTERNAL_ERROR", "Gagal menghapus attachment")
  }
}
