import { NextRequest, NextResponse } from "next/server"
import { hasPermission } from "@/lib/auth/permissions"
import { uploadToStorage } from "@/lib/storage/storage"

export async function POST(req: NextRequest) {
  const canUpload = (await hasPermission("create_items")) || (await hasPermission("edit_items"))
  if (!canUpload) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = (formData.get("image") || formData.get("file")) as File | null

  if (!file) {
    return NextResponse.json({ error: "Tidak ada file diunggah" }, { status: 400 })
  }

  try {
    const { url } = await uploadToStorage(file, {
      category: "items",
      prefix: "item",
      maxBytes: 5 * 1024 * 1024,
    })
    return NextResponse.json({ url })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload gagal"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
