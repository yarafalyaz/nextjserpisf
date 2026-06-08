import { writeFile, mkdir } from "fs/promises"
import path from "path"

/**
 * Storage abstraction. Swappable backend via STORAGE_DRIVER env:
 *   - "local" (default): writes to public/uploads/<category>/
 *   - "r2": Cloudflare R2 (S3-compatible) — wired via env, see uploadToR2
 *
 * Public URL resolution:
 *   - If NEXT_PUBLIC_ASSET_BASE_URL is set (e.g. https://cdn.yaraerp.com),
 *     returned URLs are absolute CDN URLs. Otherwise relative same-origin paths.
 *
 * No base64 is ever persisted — files are stored as binary and referenced by URL.
 */

export type UploadCategory =
  | "avatars"
  | "logos"
  | "signatures"
  | "items"
  | "attachments"

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]

export interface UploadResult {
  url: string
  key: string
}

export interface UploadOptions {
  category: UploadCategory
  /** filename prefix, e.g. "user-12" or "logo". A timestamp + ext is appended. */
  prefix?: string
  /** max bytes; defaults to 5MB */
  maxBytes?: number
  /** allowed mime types; defaults to common images */
  allowedTypes?: string[]
}

function assetBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_ASSET_BASE_URL || "").replace(/\/$/, "")
}

/** Resolve a stored key (e.g. "logos/logo-123.png") to a public URL. */
export function publicUrl(key: string): string {
  const base = assetBaseUrl()
  const clean = key.replace(/^\/+/, "")
  return base ? `${base}/${clean}` : `/uploads/${clean}`
}

function sanitizedExt(filename: string): string {
  const raw = (filename.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "")
  return (raw.slice(0, 10) || "jpg").toLowerCase()
}

export async function uploadToStorage(file: File, opts: UploadOptions): Promise<UploadResult> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024
  const allowed = opts.allowedTypes ?? ALLOWED_IMAGE_TYPES

  if (!allowed.includes(file.type)) {
    throw new Error("Format file tidak didukung. Gunakan JPG, PNG, WebP, GIF, atau SVG.")
  }
  if (file.size > maxBytes) {
    throw new Error(`Ukuran file maksimal ${Math.round(maxBytes / (1024 * 1024))}MB`)
  }

  const ext = sanitizedExt(file.name)
  const prefix = (opts.prefix || opts.category).replace(/[^a-zA-Z0-9_-]/g, "")
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const key = `${opts.category}/${filename}`

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const driver = process.env.STORAGE_DRIVER || "local"
  if (driver === "r2") {
    await uploadToR2(key, buffer, file.type)
  } else {
    await uploadToLocal(key, buffer)
  }

  return { url: publicUrl(key), key }
}

async function uploadToLocal(key: string, buffer: Buffer): Promise<void> {
  const fullPath = path.join(process.cwd(), "public", "uploads", key)
  await mkdir(path.dirname(fullPath), { recursive: true })
  await writeFile(fullPath, buffer)
}

/**
 * Cloudflare R2 upload (S3-compatible). Requires env:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * and NEXT_PUBLIC_ASSET_BASE_URL pointing to the R2 public/custom domain.
 *
 * Install @aws-sdk/client-s3 before enabling STORAGE_DRIVER=r2.
 */
async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<void> {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error("R2 storage belum dikonfigurasi (cek env R2_*).")
  }
  // Lazy import so the SDK is only required when the R2 driver is active.
  // Computed specifier avoids a compile-time dependency until @aws-sdk/client-s3 is installed.
  const sdkName = "@aws-sdk/client-s3"
  const { S3Client, PutObjectCommand } = await import(/* @vite-ignore */ sdkName)
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )
}
