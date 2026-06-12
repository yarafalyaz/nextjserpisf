import { NextRequest, NextResponse } from "next/server"
import { hasPermission } from "@/lib/auth/permissions"
import { uploadToStorage } from "@/lib/storage/storage"
import { apiError } from "@/lib/api-response"

export async function POST(req: NextRequest) {
  const canUpload = (await hasPermission("create_items")) || (await hasPermission("edit_items"))
  if (!canUpload) {
    return apiError("FORBIDDEN", "Forbidden")
  }

  const formData = await req.formData()
  const file = (formData.get("image") || formData.get("file")) as File | null

  if (!file) {
    return apiError("BAD_REQUEST", "Tidak ada file diunggah")
  }

  try {
    const { url } = await uploadToStorage(file, {
      category: "items",
      prefix: "item",
      maxBytes: 5 * 1024 * 1024,
    })
    return NextResponse.json({ url })
  } catch (e) {
    console.error("Item upload failed:", e)
    return apiError("BAD_REQUEST", "Upload gagal")
  }
}
