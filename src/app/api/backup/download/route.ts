import { NextRequest, NextResponse } from "next/server"
import { hasPermission } from "@/lib/auth/permissions"
import { apiError } from "@/lib/api-response"
import { isValidBackupName, readBackupFile } from "@/lib/db/backup"
import { logActivity } from "@/lib/services/activity-log.service"
import { createReadStream } from "fs"
import { Readable } from "stream"

export async function GET(req: NextRequest) {
  if (!(await hasPermission("manage_settings"))) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  const rawFilename = req.nextUrl.searchParams.get("file") || ""
  // Sanitize: strip path components to prevent traversal
  const filename = rawFilename.replace(/^.*[\\/]/, "").replace(/\.\./g, "")
  if (!filename || filename !== rawFilename) {
    return apiError("BAD_REQUEST", "Nama file tidak valid")
  }
  // Allowlist: hanya nama hasil createBackup (backup-*.sql). Tanpa ini,
  // nama bebas ("missing.sql", "dump.sql") lolos sanitasi lalu gagal di
  // readBackupFile sebagai 500 — padahal itu salah input klien = 400.
  // Bentuk kontrak sama dengan restore/delete (isValidBackupName).
  if (!isValidBackupName(filename)) {
    return apiError("BAD_REQUEST", "Nama file backup tidak valid")
  }

  try {
    const { path: filepath, size } = await readBackupFile(filename)

    // Audit log: who downloaded which backup, when (compliance).
    // WAJIB tercatat sebelum berkas dikirim — kegagalan audit menghentikan
    // unduhan, bukan diteruskan diam-diam.
    await logActivity("download", "Backup", 0, `Downloaded backup: ${filename}`, {
      filename,
      size,
    })

    const nodeStream = createReadStream(filepath)
    // Convert Node stream to Web ReadableStream for the Response
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(size),
      },
    })
  } catch (e) {
    // Berkas allowlist tapi tak ada (terhapus/cloud gagal) = 404, bukan 500:
    // server sehat, yang diminta yang hilang. Pesan readBackupFile
    // ("tidak ditemukan") memang untuk kasus ini, jadi kenali polanya.
    if (e instanceof Error && e.message.includes("tidak ditemukan")) {
      return apiError("NOT_FOUND", "File backup tidak ditemukan")
    }
    console.error("Backup download failed:", e)
    return apiError("INTERNAL_ERROR", "Gagal mengunduh backup")
  }
}
