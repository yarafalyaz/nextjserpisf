import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { readFile, stat } from "fs/promises"
import path from "path"

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
}

/**
 * Authenticated attachment serving route.
 * Files stored in <project>/private/uploads/attachments/<referenceType>/<filename>
 * are only served to authenticated users.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Tidak terotorisasi" }, { status: 401 })
  }

  const segments = (await params).path
  if (!segments || segments.length < 2) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Prevent path traversal
  for (const seg of segments) {
    if (seg === ".." || seg.includes("/") || seg.includes("\\")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 })
    }
  }

  const relativePath = segments.join("/")
  const absolutePath = path.join(process.cwd(), "private", "uploads", "attachments", relativePath)

  // Ensure the resolved path is still within the private directory
  const privateDir = path.join(process.cwd(), "private", "uploads", "attachments")
  if (!absolutePath.startsWith(privateDir)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  try {
    await stat(absolutePath)
  } catch {
    return NextResponse.json({ error: "File tidak ditemukan" }, { status: 404 })
  }

  const ext = path.extname(absolutePath).slice(1).toLowerCase()
  const contentType = MIME_MAP[ext] || "application/octet-stream"

  const buffer = await readFile(absolutePath)
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${segments[segments.length - 1]}"`,
      "Cache-Control": "private, max-age=3600",
    },
  })
}
