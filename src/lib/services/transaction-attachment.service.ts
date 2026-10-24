import type { TxClient } from "@/lib/db/prisma"
import { safeJsonParse } from "@/lib/utils/safe-parse"
import { unlink } from "node:fs/promises"
import path from "node:path"

/** Attach only temporary files uploaded by this user for this exact resource type. */
export async function attachPendingTransactionAttachments(
  tx: TxClient,
  input: {
    attachmentIds: unknown
    referenceType: string
    referenceId: number
    uploadedBy: number
  },
): Promise<void> {
  const parsed = typeof input.attachmentIds === "string"
    ? safeJsonParse<unknown>(input.attachmentIds)
    : input.attachmentIds
  if (parsed == null || parsed === "") return
  if (!Array.isArray(parsed)) throw new Error("Daftar lampiran tidak valid")

  const ids = [...new Set(parsed.map((value) => {
    const id = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("ID lampiran tidak valid")
    return id
  }))]
  if (ids.length === 0) return

  await tx.transactionAttachment.updateMany({
    where: {
      id: { in: ids },
      referenceType: input.referenceType,
      referenceId: 0,
      uploadedBy: input.uploadedBy,
    },
    data: { referenceId: input.referenceId },
  })
}

/**
 * Hapus lampiran dokumen beserta berkas disknya, dua fase.
 *
 * Fase 1 (dalam tx pemanggil): baca baris target + hapus barisnya — atomic
 * dengan hapus dokumennya, jadi tak ada baris menunjuk dokumen yang hilang.
 * Fase 2 (sesudah tx commit): unlink tiap berkas. Dipisah karena I/O berkas
 * tak bisa rollback bersama tx: unlink di DALAM tx yang lalu gagal = data
 * hilang permanen; unlink SESUDAH commit yang gagal = hanya sampah disk
 * (tak bisa diunduh — baris DB-nya sudah hilang — dan disapu cron
 * sweep-orphan bila referenceId=0, atau tertinggal jinak bila tidak).
 */
export async function deleteTransactionAttachmentsTx(
  tx: TxClient,
  input: { referenceType: string; referenceId: number },
): Promise<{ fileUrl: string; referenceType: string }[]> {
  const rows = await tx.transactionAttachment.findMany({
    where: { referenceType: input.referenceType, referenceId: input.referenceId },
    select: { fileUrl: true, referenceType: true },
  })
  if (rows.length === 0) return []
  await tx.transactionAttachment.deleteMany({
    where: { referenceType: input.referenceType, referenceId: input.referenceId },
  })
  return rows
}

export async function removeAttachmentFiles(
  rows: { fileUrl: string; referenceType: string }[],
  unlinkFn: (path: string) => Promise<unknown> = unlink,
): Promise<void> {
  const uploadsRoot = path.join(process.cwd(), "private", "uploads", "attachments")
  for (const row of rows) {
    // fileUrl bentuk kanonis: /api/attachments/<tipe>/<namaberkas> (tanpa
    // subpath — nama dibuat server sebagai `${tipe}-${id}-${uuid}.${ext}`).
    // Ambil segmen terakhir LEWAT pola berjangkar: `split("/").pop()` saja
    // meruntuhkan traversal ("../../x" -> "x") SEBELUM guard path bekerja,
    // sehingga guard tak pernah melihatnya. Di sini traversal ditolak di
    // sumber — baris DB yang korup tak bisa meng-unlink di luar root.
    const match = /^\/api\/attachments\/[^/]+\/([^/]+)$/.exec(row.fileUrl)
    const filename = match?.[1] ?? ""
    if (!filename || filename.includes("..")) continue
    const safeRefType = row.referenceType.replace(/[^a-zA-Z0-9_-]/g, "")
    if (!safeRefType) continue
    const filepath = path.resolve(uploadsRoot, safeRefType, filename)
    const relative = path.relative(uploadsRoot, filepath)
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue
    try {
      await unlinkFn(filepath)
    } catch (error) {
      console.error(`[deleteTransactionAttachments] gagal hapus berkas ${filepath}:`, error)
    }
  }
}

/**
 * F-2026-10-24-096-S — verifikasi & tandai-terbit foto (BR-PHOTO-06/08).
 * Dipakai server action; fungsi ini murni logika atas TxClient supaya bisa
 * diuji tanpa DB. Izin ditegakkan pemanggil (manage_qc_inspections untuk
 * verifikasi, complete_work_orders untuk terbit) — di sini hanya aturan
 * transisi yang dijaga:
 * - verifikasi: foto belum terverifikasi; pengunggah TIDAK boleh
 *   memverifikasi foto `handover` miliknya sendiri (vonis default §3);
 *   kategori lain self-verify diperbolehkan.
 * - terbit: hanya foto terverifikasi + kategori intake/progress/handover
 *   (BR-PHOTO-08); defect/other tidak pernah terbit.
 */

export interface PhotoTransitionRow {
  id: number
  photoCategory: string | null
  uploadedBy: number | null
  verifiedBy: number | null
  publishedBy: number | null
}

type PhotoTx = {
  transactionAttachment: {
    findUnique: (args: unknown) => Promise<PhotoTransitionRow | null>
    update: (args: unknown) => Promise<unknown>
  }
}

async function loadPhoto(tx: PhotoTx, attachmentId: number): Promise<PhotoTransitionRow> {
  if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
    throw new Error("ID lampiran tidak valid")
  }
  const row = await tx.transactionAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, photoCategory: true, uploadedBy: true, verifiedBy: true, publishedBy: true },
  })
  if (!row) throw new Error("Lampiran tidak ditemukan")
  return row
}

export async function verifyPhotoAttachmentTx(
  tx: PhotoTx,
  input: { attachmentId: number; verifiedBy: number; now?: Date },
): Promise<void> {
  const row = await loadPhoto(tx, input.attachmentId)
  if (row.verifiedBy != null) throw new Error("Foto sudah terverifikasi")
  const category = row.photoCategory ?? "other"
  if (category === "handover" && row.uploadedBy != null && row.uploadedBy === input.verifiedBy) {
    throw new Error("Foto serah terima tidak boleh diverifikasi oleh pengunggahnya sendiri")
  }
  await tx.transactionAttachment.update({
    where: { id: row.id },
    data: { verifiedBy: input.verifiedBy, verifiedAt: input.now ?? new Date() },
  })
}

export async function publishPhotoAttachmentTx(
  tx: PhotoTx,
  input: { attachmentId: number; publishedBy: number; now?: Date },
): Promise<void> {
  const row = await loadPhoto(tx, input.attachmentId)
  if (row.publishedBy != null) throw new Error("Foto sudah ditandai terbit")
  if (row.verifiedBy == null) throw new Error("Foto harus terverifikasi sebelum ditandai terbit")
  const category = row.photoCategory ?? "other"
  if (category !== "intake" && category !== "progress" && category !== "handover") {
    throw new Error("Kategori foto ini tidak boleh ditandai terbit")
  }
  await tx.transactionAttachment.update({
    where: { id: row.id },
    data: { publishedBy: input.publishedBy, publishedAt: input.now ?? new Date() },
  })
}
