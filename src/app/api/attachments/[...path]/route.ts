import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { canAccessAttachment } from "@/lib/auth/attachment-permissions"
import { readFile, stat } from "fs/promises"
import path from "path"
import { apiError } from "@/lib/api-response"

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
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  const segments = (await params).path
  if (!segments || segments.length < 2) {
    return apiError("NOT_FOUND", "Not found")
  }

  // Prevent path traversal
  for (const seg of segments) {
    if (seg === ".." || seg.includes("/") || seg.includes("\\")) {
      return apiError("BAD_REQUEST", "Invalid path")
    }
  }

  // Resource-level authz: the first segment is the referenceType. Being logged
  // in is not enough — the caller must be allowed to view that document type
  // (closes IDOR — reading any attachment file by guessing its path).
  if (!(await canAccessAttachment(segments[0]))) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  const relativePath = segments.join("/")
  const absolutePath = path.join(process.cwd(), "private", "uploads", "attachments", relativePath)

  // Ensure the resolved path is still within the private directory
  const privateDir = path.join(process.cwd(), "private", "uploads", "attachments")
  if (!absolutePath.startsWith(privateDir)) {
    return apiError("BAD_REQUEST", "Invalid path")
  }

  try {
    await stat(absolutePath)
  } catch {
    return apiError("NOT_FOUND", "File tidak ditemukan")
  }

  const ext = path.extname(absolutePath).slice(1).toLowerCase()
  const contentType = MIME_MAP[ext] || "application/octet-stream"

  // Only allow rendering inline for safe, previewable formats.
  // Other formats (like binary, CSV, etc.) should be forced to download
  // to prevent browser MIME-sniffing or execution.
  const previewable = new Set(["jpg", "jpeg", "png", "gif", "webp", "pdf"])
  const dispositionMode = previewable.has(ext) ? "inline" : "attachment"

  const buffer = await readFile(absolutePath)
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${dispositionMode}; filename="${segments[segments.length - 1]}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // Restrict script execution inside PDF/images
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  })
}
