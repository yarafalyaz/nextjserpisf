import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { hasPermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { readFile, stat } from "fs/promises"
import path from "path"
import { apiError } from "@/lib/api-response"

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
}

// Nama berkas privat ditulis oleh saveDownPaymentProof (R7PR-01): UUID +
// ekstensi dari whitelist unggah. Nilai warisan `/uploads/proofs/...`
// (sebelum fix) atau bentuk lain ditolak — daftar nama ditangkap fail-closed.
const PROOF_FILENAME = /^proof-dp-[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$/

/**
 * R7PR-01: penyajian bukti bayar uang muka — PRIVAT dan terotentikasi.
 * Berkas fisik di `<project>/private/uploads/proofs/<filename>`, satu-satunya
 * kunci adalah id DownPayment di URL; `proofImage` (nama berkas) TIDAK pernah
 * keluar sebagai URL langsung. Predecessor-nya, `/uploads/proofs/
 * proof-dp-<Date.now()>`, bisa ditebak timestamp tanpa sesi.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  // Samakan dengan route notifikasi/avatar (R7PB-02): sesi nonaktif ditolak —
  // proxy hanya men-decode JWT, callback isActive tidak berjalan di sini.
  if (!session?.user?.id || session.user.isActive === false) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  const { id } = await params
  const dpId = Number(id)
  if (!Number.isSafeInteger(dpId) || dpId <= 0) {
    return apiError("NOT_FOUND", "Bukti tidak ditemukan")
  }

  if (!(await hasPermission("view_down_payments"))) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  const dp = await prisma.downPayment.findUnique({
    where: { id: dpId },
    select: { proofImage: true },
  })
  const filename = dp?.proofImage ?? ""
  if (!PROOF_FILENAME.test(filename)) {
    return apiError("NOT_FOUND", "Bukti tidak ditemukan")
  }

  const privateDir = path.join(process.cwd(), "private", "uploads", "proofs")
  const absolutePath = path.join(privateDir, filename)
  if (!absolutePath.startsWith(privateDir)) {
    return apiError("BAD_REQUEST", "Path berkas tidak valid")
  }

  try {
    await stat(absolutePath)
  } catch {
    return apiError("NOT_FOUND", "Bukti tidak ditemukan")
  }

  const ext = filename.split(".").pop()!.toLowerCase()
  const buffer = await readFile(absolutePath)
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": MIME_MAP[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename}"`,
      // Putaran 62: bukti bayar privat tidak disimpan di disk cache PC
      // bersama; samakan standar no-store route pdf/backup/export.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      // Batasi eksekusi skrip di dalam PDF/gambar.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  })
}
