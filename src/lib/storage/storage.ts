import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { prisma } from "@/lib/db/prisma"

/**
 * Storage abstraction. Config is DB-driven (SystemSetting) with env fallback.
 *   Driver: "local" (default) writes to public/uploads/<category>/
 *           "r2" uploads to Cloudflare R2 (S3-compatible)
 *
 * Public URL resolution:
 *   - If an asset base URL is configured (DB assetBaseUrl or NEXT_PUBLIC_ASSET_BASE_URL),
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

export interface StorageConfig {
  driver: string
  fallbackLocal: boolean
  assetBaseUrl: string
  r2AccountId: string
  r2AccessKeyId: string
  r2SecretAccessKey: string
  r2Bucket: string
}

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

/** Read storage config: DB SystemSetting first, env as fallback. */
export async function getStorageConfig(): Promise<StorageConfig> {
  let s: {
    storageDriver: string
    storageFallbackLocal: boolean
    assetBaseUrl: string | null
    r2AccountId: string | null
    r2AccessKeyId: string | null
    r2SecretAccessKey: string | null
    r2Bucket: string | null
  } | null = null
  try {
    s = await prisma.systemSetting.findFirst({
      select: {
        storageDriver: true,
        storageFallbackLocal: true,
        assetBaseUrl: true,
        r2AccountId: true,
        r2AccessKeyId: true,
        r2SecretAccessKey: true,
        r2Bucket: true,
      },
    })
  } catch {
    s = null
  }
  return {
    driver: s?.storageDriver || process.env.STORAGE_DRIVER || "local",
    fallbackLocal: s?.storageFallbackLocal ?? true,
    assetBaseUrl: s?.assetBaseUrl || process.env.NEXT_PUBLIC_ASSET_BASE_URL || "",
    r2AccountId: s?.r2AccountId || process.env.R2_ACCOUNT_ID || "",
    r2AccessKeyId: s?.r2AccessKeyId || process.env.R2_ACCESS_KEY_ID || "",
    r2SecretAccessKey: s?.r2SecretAccessKey || process.env.R2_SECRET_ACCESS_KEY || "",
    r2Bucket: s?.r2Bucket || process.env.R2_BUCKET || "",
  }
}

/** Resolve a stored key (e.g. "logos/logo-123.png") to a public URL. */
export function publicUrl(key: string, assetBaseUrl?: string): string {
  const base = (assetBaseUrl ?? process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").replace(/\/$/, "")
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

  const config = await getStorageConfig()

  const ext = sanitizedExt(file.name)
  const prefix = (opts.prefix || opts.category).replace(/[^a-zA-Z0-9_-]/g, "")
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const key = `${opts.category}/${filename}`

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  if (config.driver === "r2") {
    try {
      await uploadToR2(key, buffer, file.type, config)
      return { url: publicUrl(key, config.assetBaseUrl), key }
    } catch (err) {
      if (!config.fallbackLocal) throw err
      // Hybrid fallback: R2/CDN unreachable -> store locally so upload still succeeds.
      console.warn("[storage] R2 upload gagal, fallback ke lokal:", err instanceof Error ? err.message : err)
      await uploadToLocal(key, buffer)
      // Local files are served same-origin, not via the R2/CDN base URL.
      return { url: publicUrl(key), key }
    }
  }

  await uploadToLocal(key, buffer)
  // For pure-local driver, an assetBaseUrl that proxies the app (e.g. Cloudflare
  // CDN in front of Next) still resolves /uploads, so honor it when set.
  return { url: publicUrl(key, config.assetBaseUrl), key }
}

async function uploadToLocal(key: string, buffer: Buffer): Promise<void> {
  const fullPath = path.join(process.cwd(), "public", "uploads", key)
  await mkdir(path.dirname(fullPath), { recursive: true })
  await writeFile(fullPath, buffer)
}

/** Build an R2 (S3-compatible) client from config. Throws if incomplete. */
async function r2Client(config: StorageConfig) {
  const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2Bucket } = config
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
    throw new Error("Cloudflare R2 belum dikonfigurasi lengkap. Lengkapi di Pengaturan > Penyimpanan.")
  }
  // Computed specifier avoids a compile-time dependency until @aws-sdk/client-s3 is installed.
  const sdkName = "@aws-sdk/client-s3"
  const sdk = await import(/* @vite-ignore */ sdkName)
  const client = new sdk.S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
  })
  return { client, sdk, bucket: r2Bucket }
}

/**
 * Cloudflare R2 upload (S3-compatible). Reads credentials from StorageConfig.
 * Install @aws-sdk/client-s3 before using R2.
 */
async function uploadToR2(
  key: string,
  buffer: Buffer,
  contentType: string,
  config: StorageConfig
): Promise<void> {
  const { client, sdk, bucket } = await r2Client(config)
  await client.send(
    new sdk.PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType })
  )
}

/** Upload an arbitrary buffer to R2 if the active driver is "r2". No-op otherwise.
 *  Used for offsite copies (e.g. database backups). Returns true if uploaded. */
export async function uploadToCloudIfEnabled(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<boolean> {
  const config = await getStorageConfig()
  if (config.driver !== "r2") return false
  await uploadToR2(key, buffer, contentType, config)
  return true
}

/** List object keys under a prefix in R2 (empty when driver != r2). */
export async function listCloudKeys(prefix: string): Promise<string[]> {
  const config = await getStorageConfig()
  if (config.driver !== "r2") return []
  const { client, sdk, bucket } = await r2Client(config)
  const res = await client.send(new sdk.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))
  return (res.Contents || []).map((o: { Key?: string }) => o.Key || "").filter(Boolean)
}

/** Download an object from R2 as a Buffer. */
export async function downloadFromCloud(key: string): Promise<Buffer> {
  const config = await getStorageConfig()
  const { client, sdk, bucket } = await r2Client(config)
  const res = await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }))
  const bytes = await res.Body.transformToByteArray()
  return Buffer.from(bytes)
}

/** Delete an object from R2 (no-op when driver != r2). */
export async function deleteFromCloud(key: string): Promise<void> {
  const config = await getStorageConfig()
  if (config.driver !== "r2") return
  const { client, sdk, bucket } = await r2Client(config)
  await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
