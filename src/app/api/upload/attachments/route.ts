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
    return apiError("BAD_REQUEST", "No file uploaded")
  }

  if (!referenceType || !referenceId) {
    return apiError("BAD_REQUEST", "referenceType and referenceId are required")
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
    return apiError("BAD_REQUEST", "Invalid referenceId")
  }
  const referenceIdNum = Number.parseInt(referenceId, 10)
  const userId = Number.parseInt(String(session.user.id), 10)
  if (!Number.isSafeInteger(referenceIdNum) || referenceIdNum < 0) {
    return apiError("BAD_REQUEST", "Invalid referenceId")
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    return apiError("BAD_REQUEST", "Invalid user")
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Sanitize referenceType to prevent path traversal
  const safeRefType = referenceType.replace(/[^a-zA-Z0-9_-]/g, "")
  if (!safeRefType || safeRefType !== referenceType) {
    return apiError("BAD_REQUEST", "Invalid referenceType")
  }

  // Whitelist allowed reference types (same as GET)
  const allowedRefTypes = [
    "sales_invoice", "sales_order", "quotation", "purchase_order",
    "vendor_bill", "vendor_payment", "sales_payment", "down_payment",
    "journal", "expense", "material_issue", "work_order", "project",
    "goods_receipt", "purchase_return", "sales_return", "bank_statement",
    "delivery_order", "inventory_transfer", "stock_adjustment", "petty_cash",
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
    return apiError("BAD_REQUEST", "Invalid file path")
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
    return apiError("BAD_REQUEST", "referenceType and referenceId are required")
  }

  // Whitelist allowed reference types to prevent enumeration of arbitrary tables
  const allowedRefTypes = [
    "sales_invoice", "sales_order", "quotation", "purchase_order",
    "vendor_bill", "vendor_payment", "sales_payment", "down_payment",
    "journal", "expense", "material_issue", "work_order", "project",
    "goods_receipt", "purchase_return", "sales_return", "bank_statement",
    "delivery_order", "inventory_transfer", "stock_adjustment", "petty_cash",
  ]
  if (!allowedRefTypes.includes(referenceType)) {
    return apiError("BAD_REQUEST", "Tipe referensi tidak valid")
  }

  if (!/^\d+$/.test(referenceId)) {
    return apiError("BAD_REQUEST", "Invalid referenceId")
  }
  const referenceIdNum = Number.parseInt(referenceId, 10)
  if (!Number.isSafeInteger(referenceIdNum) || referenceIdNum < 0) {
    return apiError("BAD_REQUEST", "Invalid referenceId")
  }

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
      ...(referenceIdNum === 0 ? { uploadedBy: Number(session.user.id) } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  return NextResponse.json(attachments)
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
