"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import { hasPermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { canAccessAttachment } from "@/lib/auth/attachment-permissions"
import {
  publishPhotoAttachmentTx,
  verifyPhotoAttachmentTx,
} from "@/lib/services/transaction-attachment.service"

/**
 * F-2026-10-24-096-S — aksi verifikasi & tandai-terbit foto.
 * Verifikasi: manage_qc_inspections (QC/foreman). Terbit:
 * complete_work_orders (kepala bengkel). Aturan transisi (self-verify
 * handover dilarang, terbit hanya terverifikasi + kategori boleh-terbit)
 * di transaction-attachment.service.ts. Nol jurnal (BR-PHOTO-10).
 */

async function currentUserId(): Promise<number> {
  const session = await auth()
  const raw = String(session?.user?.id ?? "")
  if (!/^\d+$/.test(raw)) throw new Error("Tidak terotorisasi")
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Tidak terotorisasi")
  return id
}

async function loadAttachmentRef(attachmentId: number) {
  if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
    throw new Error("ID lampiran tidak valid")
  }
  const row = await prisma.transactionAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, referenceType: true, referenceId: true },
  })
  if (!row) throw new Error("Lampiran tidak ditemukan")
  return row
}

export async function verifyPhotoAttachment(attachmentId: number): Promise<{ ok: true }> {
  const userId = await currentUserId()
  if (!(await hasPermission("manage_qc_inspections"))) throw new Error("Akses ditolak")
  const ref = await loadAttachmentRef(attachmentId)
  if (!(await canAccessAttachment(ref.referenceType, ref.referenceId))) throw new Error("Akses ditolak")
  await prisma.$transaction((tx) =>
    verifyPhotoAttachmentTx(tx as never, { attachmentId, verifiedBy: userId }),
  )
  revalidatePath("/produksi/perintah-kerja")
  return { ok: true }
}

export async function publishPhotoAttachment(attachmentId: number): Promise<{ ok: true }> {
  const userId = await currentUserId()
  if (!(await hasPermission("complete_work_orders"))) throw new Error("Akses ditolak")
  const ref = await loadAttachmentRef(attachmentId)
  if (!(await canAccessAttachment(ref.referenceType, ref.referenceId))) throw new Error("Akses ditolak")
  await prisma.$transaction((tx) =>
    publishPhotoAttachmentTx(tx as never, { attachmentId, publishedBy: userId }),
  )
  revalidatePath("/produksi/perintah-kerja")
  return { ok: true }
}
