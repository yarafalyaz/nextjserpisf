import { NextRequest, NextResponse } from "next/server"
import { hasPermission } from "@/lib/auth/permissions"
import { readBackupFile } from "@/lib/db/backup"
import { createReadStream } from "fs"
import { Readable } from "stream"

export async function GET(req: NextRequest) {
  if (!(await hasPermission("manage_settings"))) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 })
  }

  const rawFilename = req.nextUrl.searchParams.get("file") || ""
  // Sanitize: strip path components to prevent traversal
  const filename = rawFilename.replace(/^.*[\\/]/, "").replace(/\.\./g, "")
  if (!filename || filename !== rawFilename) {
    return NextResponse.json({ error: "Nama file tidak valid" }, { status: 400 })
  }

  try {
    const { path: filepath, size } = await readBackupFile(filename)
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
    const message = e instanceof Error ? e.message : "Gagal mengunduh backup"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
