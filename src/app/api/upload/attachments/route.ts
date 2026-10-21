import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { canAccessAttachment, canModifyAttachment } from "@/lib/auth/attachment-permissions"
import { writeFile, mkdir, unlink } from "fs/promises"
import { randomUUID } from "crypto"
import path from "path"
import { apiError } from "@/lib/api-response"
import { assertCSRF } from "@/lib/security/csrf"

export async function POST(req: NextRequest) {
  try {
  const session = await auth()
  if (!session?.user?.id) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }
  await assertCSRF()

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const referenceType = formData.get("referenceType") as string | null
  const referenceId = formData.get("referenceId") as string | null

  if (!file) {
    return apiError("BAD_REQUEST", "Tidak ada berkas yang diunggah")
  }

  if (!referenceType || !referenceId) {
    return apiError("BAD_REQUEST", "referenceType dan referenceId wajib diisi")
  }

  // Validate file type
  const allowedTypes = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
  ]
  if (!allowedTypes.includes(file.type)) {
    return apiError("BAD_REQUEST", "Format file tidak didukung. Gunakan JPG, PNG, WebP, GIF, atau PDF.")
  }

  // Validate file size (max 50MB)
  if (file.size > 50 * 1024 * 1024) {
    return apiError("BAD_REQUEST", "Ukuran file maksimal 50MB")
  }

  if (!/^\d+$/.test(referenceId)) {
    return apiError("BAD_REQUEST", "referenceId tidak valid")
  }
  const referenceIdNum = Number.parseInt(referenceId, 10)
  if (!Number.isSafeInteger(referenceIdNum) || referenceIdNum < 0) {
    return apiError("BAD_REQUEST", "referenceId tidak valid")
  }
  const userIdRaw = String(session.user.id)
  if (!/^\d+$/.test(userIdRaw)) {
    return apiError("BAD_REQUEST", "Pengguna tidak valid")
  }
  const userId = Number(userIdRaw)
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return apiError("BAD_REQUEST", "Pengguna tidak valid")
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Jangan percaya `file.type` (header Content-Type kiriman klien): periksa
  // signature binernya. Tanpa ini, skrip .php/.svg yang di-header-kan
  // `image/png` lolos sebagai gambar dan tersimpan di server.
  const signature = buffer.subarray(0, 12)
  const looksImage =
    // JPEG: FF D8 FF
    (signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) ||
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    (signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47) ||
    // GIF: "GIF87a" / "GIF89a"
    (signature[0] === 0x47 && signature[1] === 0x49 && signature[2] === 0x46) ||
    // WebP: "RIFF"...."WEBP"
    (signature.toString("ascii", 0, 4) === "RIFF" && signature.toString("ascii", 8, 12) === "WEBP")
  const looksPdf = signature.toString("ascii", 0, 5) === "%PDF-"
  if (!looksImage && !looksPdf) {
    return apiError("BAD_REQUEST", "Isi berkas tidak sesuai format. Gunakan JPG, PNG, WebP, GIF, atau PDF.")
  }

  // Sanitize referenceType to prevent path traversal
  const safeRefType = referenceType.replace(/[^a-zA-Z0-9_-]/g, "")
  if (!safeRefType || safeRefType !== referenceType) {
    return apiError("BAD_REQUEST", "referenceType tidak valid")
  }

  // Whitelist allowed reference types (same as GET)
  const allowedRefTypes = [
    "sales_invoice", "sales_order", "quotation", "purchase_order",
    "vendor_bill", "vendor_payment", "sales_payment", "down_payment",
    "journal", "expense", "material_issue", "work_order", "project",
    "goods_receipt", "purchase_return", "sales_return", "bank_statement",
    "delivery_order", "inventory_transfer", "stock_adjustment", "petty_cash", "WarrantyClaim",
  ]
  if (!allowedRefTypes.includes(safeRefType)) {
    return apiError("BAD_REQUEST", "Tipe referensi tidak valid")
  }

  // Existing records require write access and resource scope. New-form uploads
  // use referenceId=0 and are restricted to types with an explicit create grant.
  if (!(await canModifyAttachment(safeRefType, referenceIdNum))) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  // Save to private/uploads/attachments/{referenceType} (NOT public/ — served via authenticated route)
  const uploadDir = path.join(process.cwd(), "private", "uploads", "attachments", safeRefType)
  await mkdir(uploadDir, { recursive: true })

  // Sanitize extension - only allow alphanumeric
  const rawExt = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "")
  const ext = rawExt.slice(0, 10) || "bin"
  const filename = `${safeRefType}-${referenceIdNum}-${randomUUID()}.${ext}`
  const filepath = path.join(uploadDir, filename)

  // Final path traversal guard
  const relativePath = path.relative(uploadDir, filepath)
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return apiError("BAD_REQUEST", "Path berkas tidak valid")
  }

  await writeFile(filepath, buffer, { flag: "wx" })

  const fileUrl = `/api/attachments/${safeRefType}/${filename}`

  // Save to database
  let attachment
  try {
    attachment = await prisma.transactionAttachment.create({
      data: {
        referenceType,
        referenceId: referenceIdNum,
        filename,
        originalName: file.name,
        fileUrl,
        fileSize: file.size,
        mimeType: file.type,
        uploadedBy: userId,
      },
      // Kontrak POST sama dengan GET: tanpa select, Prisma create mengembalikan
      // baris utuh (referenceType/referenceId/uploadedBy internal ikut bocor).
      select: {
        id: true,
        filename: true,
        originalName: true,
        fileUrl: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
      },
    })
  } catch (error) {
    await unlink(filepath).catch(() => undefined)
    throw error
  }

  return NextResponse.json(attachment)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CSRF validation failed:")) {
      return apiError("FORBIDDEN", "Permintaan lintas situs ditolak")
    }
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}

export async function GET(req: NextRequest) {
  try {
  const session = await auth()
  if (!session?.user?.id) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  const { searchParams } = new URL(req.url)
  const referenceType = searchParams.get("tipeReferensi")
  const referenceId = searchParams.get("referensiId")

  if (!referenceType || !referenceId) {
    return apiError("BAD_REQUEST", "referenceType dan referenceId wajib diisi")
  }

  // Whitelist allowed reference types to prevent enumeration of arbitrary tables
  const allowedRefTypes = [
    "sales_invoice", "sales_order", "quotation", "purchase_order",
    "vendor_bill", "vendor_payment", "sales_payment", "down_payment",
    "journal", "expense", "material_issue", "work_order", "project",
    "goods_receipt", "purchase_return", "sales_return", "bank_statement",
    "delivery_order", "inventory_transfer", "stock_adjustment", "petty_cash", "WarrantyClaim",
  ]
  if (!allowedRefTypes.includes(referenceType)) {
    return apiError("BAD_REQUEST", "Tipe referensi tidak valid")
  }

  if (!/^\d+$/.test(referenceId)) {
    return apiError("BAD_REQUEST", "referenceId tidak valid")
  }
  const referenceIdNum = Number.parseInt(referenceId, 10)
  if (!Number.isSafeInteger(referenceIdNum) || referenceIdNum < 0) {
    return apiError("BAD_REQUEST", "referenceId tidak valid")
  }
  const userIdRawGet = String(session.user.id)
  const userIdForQuery = /^\d+$/.test(userIdRawGet) ? Number(userIdRawGet) : -1

  // Check the specific document and its warehouse scope, not only its module.
  const allowed = referenceIdNum === 0
    ? await canModifyAttachment(referenceType, referenceIdNum)
    : await canAccessAttachment(referenceType, referenceIdNum)
  if (!allowed) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  const attachments = await prisma.transactionAttachment.findMany({
    where: {
      referenceType,
      referenceId: referenceIdNum,
      ...(referenceIdNum === 0 ? { uploadedBy: userIdForQuery } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    // Kontrak GET hanya field yang dipakai TransactionAttachments; tanpa
    // select, referenceType/referenceId/uploadedBy ikut bocor ke klien.
    select: {
      id: true,
      filename: true,
      originalName: true,
      fileUrl: true,
      fileSize: true,
      mimeType: true,
      createdAt: true,
    },
  })

  return NextResponse.json(attachments)
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
