import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { uploadToStorage, type UploadCategory } from "@/lib/storage/storage"

const VALID_CATEGORIES: UploadCategory[] = ["avatars", "logos", "signatures", "items", "attachments"]

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

  try {
    const { url } = await uploadToStorage(file, {
      category,
      prefix: `${category}-u${session.user.id}`,
      maxBytes: 5 * 1024 * 1024,
    })
    return NextResponse.json({ url })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload gagal"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
