import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { apiError } from "@/lib/api-response"
import { prisma } from "@/lib/db/prisma"
import { assertCSRF } from "@/lib/security/csrf"
import { approveStep, rejectStep } from "@/actions/approval.actions"
import { notificationService } from "@/lib/services/notification.service"
import { safeJsonParse } from "@/lib/utils/safe-parse"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.isActive === false) {
      return apiError("UNAUTHORIZED", "Tidak terotorisasi")
    }
    await assertCSRF()

    const { id } = await params
    const notificationId = Number(id)
    const userId = Number(session.user.id)
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(notificationId) || notificationId <= 0) {
      return apiError("BAD_REQUEST", "ID notifikasi tidak valid")
    }
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return apiError("BAD_REQUEST", "Pengguna tidak valid")
    }

    const rawBody = await request.text()
    const json = safeJsonParse<Record<string, unknown>>(rawBody)
    const action = json?.action
    const notes = typeof json?.notes === "string" ? json.notes : ""

    if (action !== "approve" && action !== "reject") {
      return apiError("BAD_REQUEST", "Aksi tidak valid (hanya approve atau reject)")
    }

    // Ambil notifikasi milik user
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true, body: true },
    })
    if (!notification) {
      return apiError("NOT_FOUND", "Notifikasi tidak ditemukan")
    }

    // Cari slug atau ID approval dari body notifikasi
    // Format umum: "... Buka /pengaturan/persetujuan/[slug]"
    const match = notification.body.match(/\/pengaturan\/persetujuan\/([a-zA-Z0-9_-]+)/)
    if (!match || !match[1]) {
      return apiError("BAD_REQUEST", "Notifikasi ini bukan tautan persetujuan dokumen")
    }
    const slugOrId = match[1]

    // Cari record approval berdasarkan slug atau id
    const isNum = /^\d+$/.test(slugOrId)
    const approval = await prisma.approval.findFirst({
      where: {
        OR: [
          { slug: slugOrId },
          ...(isNum ? [{ id: Number(slugOrId) }] : []),
        ],
      },
      select: { id: true, status: true },
    })

    if (!approval) {
      return apiError("NOT_FOUND", "Dokumen persetujuan tidak ditemukan")
    }
    if (approval.status !== "pending") {
      return apiError("CONFLICT", `Persetujuan sudah selesai dengan status '${approval.status}'`)
    }

    // Panggil server action approveStep atau rejectStep
    const formData = new FormData()
    if (notes) formData.set("notes", notes)

    if (action === "approve") {
      await approveStep(approval.id, formData)
    } else {
      await rejectStep(approval.id, formData)
    }

    // Tandai notifikasi sebagai telah dibaca
    await notificationService.markAsRead(notificationId, userId)

    return NextResponse.json({
      success: true,
      message: action === "approve" ? "Dokumen berhasil disetujui" : "Dokumen berhasil ditolak",
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("CSRF validation failed:")) {
      return apiError("FORBIDDEN", "Permintaan lintas situs ditolak")
    }
    const message = err instanceof Error ? err.message : "Gagal memproses persetujuan"
    return apiError("INTERNAL_ERROR", message)
  }
}
