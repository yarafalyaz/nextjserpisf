import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { uploadToStorage, type UploadCategory } from "@/lib/storage/storage"
import { requirePermission } from "@/lib/auth/permissions"

const VALID_CATEGORIES: UploadCategory[] = ["avatars", "logos", "signatures", "items", "attachments"]

// Per-category permission: only users with relevant permissions can upload
const CATEGORY_PERMISSIONS: Record<UploadCategory, string | null> = {
  avatars: null, // any authenticated user can upload their own avatar
  logos: "manage_settings",
  signatures: "manage_settings",
  items: "edit_items",
  attachments: null, // controlled by the attachment-specific route
}

/**
 * Generic upload endpoint. POST multipart/form-data with:
 *   - file: the file blob
 *   - category: one of avatars | logos | signatures | items | attachments
 *
 * Returns { url }. Does NOT mutate any DB record (caller persists the URL).
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Tidak terotorisasi" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const category = String(formData.get("category") || "attachments") as UploadCategory

  if (!file) {
    return NextResponse.json({ error: "Tidak ada file diunggah" }, { status: 400 })
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Kategori upload tidak valid" }, { status: 400 })
  }

  // Enforce per-category permission
  const requiredPerm = CATEGORY_PERMISSIONS[category]
  if (requiredPerm) {
    try {
      await requirePermission(requiredPerm)
    } catch {
      return NextResponse.json({ error: "Tidak memiliki izin untuk kategori ini" }, { status: 403 })
    }
  }

  try {
    const { url } = await uploadToStorage(file, {
      category,
      prefix: `${category}-u${session.user.id}`,
      maxBytes: 5 * 1024 * 1024,
    })
    return NextResponse.json({ url })
  } catch (e) {
    console.error("Upload failed:", e)
    return NextResponse.json({ error: "Upload gagal" }, { status: 400 })
  }
}
