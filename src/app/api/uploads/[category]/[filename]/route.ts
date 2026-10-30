import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { hasPermission } from "@/lib/auth/permissions"
import { readFile, stat } from "fs/promises"
import path from "path"
import { apiError } from "@/lib/api-response"

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
}

// Nama berkas ditulis uploadToStorage: prefix tersanitasi + Date.now +
// 12 char UUID. Bentuk lain (termasuk traversal) ditolak fail-closed.
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9_-]*-\d+-[a-z0-9]+\.(jpg|jpeg|png|gif|webp)$/

/**
 * R7PB-01: penyajian unggahan privat (avatars, signatures) — TEROTENTIKASI.
 * Berkas fisik di `<project>/private/uploads/<category>/<filename>`.
 * `avatars`: semua user ber-sesi (navbar pengguna lain) — pemeriksaannya
 * sesi aktif saja; `signatures`: data jabatan, wajib `manage_settings`
 * (izin yang sama dengan jalur unggahnya). Nilai warisan
 * `/uploads/avatars|signatures/...` di public/ TIDAK dilayani route ini —
 * berkas lama tetap publik sampai dimigrasikan/dicabut saat deploy.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ category: string; filename: string }> }
) {
  const session = await auth()
  if (!session?.user?.id || session.user.isActive === false) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  const { category, filename } = await params
  if (category !== "avatars" && category !== "signatures") {
    return apiError("NOT_FOUND", "Berkas tidak ditemukan")
  }
  if (!FILENAME.test(filename)) {
    return apiError("NOT_FOUND", "Berkas tidak ditemukan")
  }

  if (category === "signatures" && !(await hasPermission("manage_settings"))) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  const privateDir = path.join(process.cwd(), "private", "uploads")
  const absolutePath = path.join(privateDir, category, filename)
  if (!absolutePath.startsWith(privateDir)) {
    return apiError("BAD_REQUEST", "Path berkas tidak valid")
  }

  try {
    await stat(absolutePath)
  } catch {
    return apiError("NOT_FOUND", "Berkas tidak ditemukan")
  }

  const ext = filename.split(".").pop()!.toLowerCase()
  const buffer = await readFile(absolutePath)
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": MIME_MAP[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  })
}
