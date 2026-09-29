import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { uploadToStorage, type UploadCategory } from "@/lib/storage/storage"
import { requirePermission } from "@/lib/auth/permissions"
import { apiError } from "@/lib/api-response"
import { assertCSRF } from "@/lib/security/csrf"

const VALID_CATEGORIES: UploadCategory[] = ["avatars", "logos", "signatures", "items"]

// Per-category permission: only users with relevant permissions can upload
const CATEGORY_PERMISSIONS: Partial<Record<UploadCategory, string | null>> = {
  avatars: null, // any authenticated user can upload their own avatar
  logos: "manage_settings",
  signatures: "manage_settings",
  items: "edit_items",
}

/**
 * Generic upload endpoint. POST multipart/form-data with:
 *   - file: the file blob
 *   - category: one of avatars | logos | signatures | items
 *
 * Returns { url }. Does NOT mutate any DB record (caller persists the URL).
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }
  try {
    await assertCSRF()
  } catch {
    return apiError("FORBIDDEN", "Permintaan lintas situs ditolak")
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const categoryValue = formData.get("category")

  if (!file) {
    return apiError("BAD_REQUEST", "Tidak ada file diunggah")
  }
  if (typeof categoryValue !== "string" || categoryValue.length === 0) {
    return apiError("BAD_REQUEST", "Kategori upload wajib diisi")
  }
  const category = categoryValue as UploadCategory
  if (!VALID_CATEGORIES.includes(category)) {
    return apiError("BAD_REQUEST", "Kategori upload tidak valid")
  }

  // Enforce per-category permission
  const requiredPerm = CATEGORY_PERMISSIONS[category]
  if (requiredPerm) {
    try {
      await requirePermission(requiredPerm)
    } catch {
      return apiError("FORBIDDEN", "Tidak memiliki izin untuk kategori ini")
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
    return apiError("BAD_REQUEST", "Upload gagal")
  }
}
