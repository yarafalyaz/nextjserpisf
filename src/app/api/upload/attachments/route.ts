import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { canAccessAttachment, canModifyAttachment } from "@/lib/auth/attachment-permissions"
import { writeFile, mkdir, unlink } from "fs/promises"
import { randomUUID } from "crypto"
import path from "path"
import { apiError } from "@/lib/api-response"
import { isPhotoCategory } from "@/lib/reports/attachment-photo"
import { assertCSRF } from "@/lib/security/csrf"

/**
 * Ekstensi tersimpan dari MIME yang sudah divalidasi, bukan nama berkas klien
 * (pola resolveExt di storage.ts): "laporan.html" + header image/png tanpa ini
 * tersimpan .html dan menipu konsumen nama/ikon walau served via route
 * lampiran (sandbox, bukan public dir). Fallback .bin bila MIME tak dikenal.
 */
export function resolveAttachmentExt(mimeType: string, filename: string): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
  }
  const known = byMime[mimeType]
  if (known) return known
  const raw = (filename.split(".").pop() || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase()
  const dangerous = new Set(["html", "htm", "xhtml", "xml", "svg", "js", "mjs", "cjs", "php", "phtml", "phar", "sh"])
  if (!raw || dangerous.has(raw)) return "bin"
  return raw
}

/**
 * MIME dari signature biner (temuan BOT 6 PR #344: signature harus cocok
 * dengan MIME terdeklarasi, bukan sekadar satu dari allowlist).
 * Kembalikan null bila tidak cocok dengan signature yang dikenal.
 */
export function detectMimeFromSignature(header: Buffer): string | null {
  // JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg"
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) return "image/png"
  // GIF: "GIF87a" / "GIF89a"
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return "image/gif"
  // WebP: "RIFF"...."WEBP"
  if (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") return "image/webp"
  // PDF: "%PDF-"
  if (header.toString("ascii", 0, 5) === "%PDF-") return "application/pdf"
  return null
}

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
  const userIdRaw = String(session.user.id)
  if (!/^\d+$/.test(userIdRaw)) {
    return apiError("BAD_REQUEST", "Pengguna tidak valid")
  }
  const userId = Number(userIdRaw)
  if (!Number.isSafeInteger(referenceIdNum) || referenceIdNum < 0) {
    return apiError("BAD_REQUEST", "referenceId tidak valid")
  }
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return apiError("BAD_REQUEST", "Pengguna tidak valid")
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Jangan percaya `file.type` (header Content-Type kiriman klien): periksa
  // signature binernya. Tanpa ini, skrip .php/.svg yang di-header-kan
  // `image/png` lolos sebagai gambar dan tersimpan di server.
  // Signature juga harus COCOK dengan MIME terdeklarasi (temuan BOT 6 PR #344):
  // isi JPEG + header application/pdf sebelumnya tersimpan .pdf dengan
  // mimeType DB application/pdf — ekstensi/mime berbohong terhadap isi.
  // Pakai MIME hasil deteksi untuk ekstensi + DB, bukan `file.type` klien.
  const detectedMime = detectMimeFromSignature(buffer.subarray(0, 12))
  if (!detectedMime) {
    return apiError("BAD_REQUEST", "Isi berkas tidak sesuai format. Gunakan JPG, PNG, WebP, GIF, atau PDF.")
  }
  if (detectedMime !== file.type) {
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
    // F-2026-10-24-096-S: induk foto tahap/inspeksi (BR-PHOTO-01).
    "customer_vehicle", "project_stage", "work_order_operation", "qc_inspection",
  ]
  if (!allowedRefTypes.includes(safeRefType)) {
    return apiError("BAD_REQUEST", "Tipe referensi tidak valid")
  }

  // F-2026-10-24-096-S BR-PHOTO-02: kategori foto tertutup dari klien;
  // nilai di luar daftar ditolak, kosong = null (dibaca `other`).
  const photoCategoryRaw = formData.get("photoCategory") as string | null
  if (photoCategoryRaw != null && photoCategoryRaw !== "" && !isPhotoCategory(photoCategoryRaw)) {
    return apiError("BAD_REQUEST", "Kategori foto tidak valid")
  }
  const photoCategory = photoCategoryRaw ? photoCategoryRaw : null

  // Existing records require write access and resource scope. New-form uploads
  // use referenceId=0 and are restricted to types with an explicit create grant.
  if (!(await canModifyAttachment(safeRefType, referenceIdNum))) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  // Save to private/uploads/attachments/{referenceType} (NOT public/ — served via authenticated route)
  const uploadDir = path.join(process.cwd(), "private", "uploads", "attachments", safeRefType)
  await mkdir(uploadDir, { recursive: true })

  // Ekstensi dari MIME hasil deteksi signature, bukan nama klien (resolveAttachmentExt).
  const ext = resolveAttachmentExt(detectedMime, file.name)
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
        mimeType: detectedMime,
        uploadedBy: userId,
        photoCategory,
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
        photoCategory: true,
        verifiedBy: true,
        verifiedAt: true,
        publishedBy: true,
        publishedAt: true,
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
    // F-2026-10-24-096-S: induk foto tahap/inspeksi (BR-PHOTO-01).
    "customer_vehicle", "project_stage", "work_order_operation", "qc_inspection",
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
    // Kontrak GET hanya field yang dipakai TransactionAttachments; tanpa
    // select, referenceType/referenceId/uploadedBy ikut bocor ke klien.
    select: {
      id: true,
      filename: true,
      originalName: true,
      fileUrl: true,
      fileSize: true,
      mimeType: true,
      photoCategory: true,
      verifiedBy: true,
      verifiedAt: true,
      publishedBy: true,
      publishedAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json(attachments)
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
