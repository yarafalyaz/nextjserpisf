/**
 * Menyiapkan logo perusahaan untuk kop PDF di sisi server.
 *
 * jsPDF hanya bisa menanamkan gambar secara sinkron, dan logo tersimpan sebagai
 * URL (hasil unggahan), bukan data — jadi berkasnya diambil lebih dulu lalu
 * diubah menjadi data URL. Ukuran aslinya dibaca dari header berkas agar rasio
 * logo tidak gepeng.
 *
 * Semua kegagalan (URL relatif tanpa origin, jaringan mati, format tak dikenal)
 * menghasilkan `null`: kop tetap tercetak tanpa logo, bukan gagal total.
 */

import type { DocumentLogo } from "./types"
import { imageSizeFromBuffer } from "./image-size"

/** Rasio cadangan (tinggi/lebar) bila dimensi asli tidak terbaca. */
const FALLBACK_ASPECT = 0.7
const MAX_LOGO_BYTES = 5 * 1024 * 1024

function sizeOf(buffer: Buffer): { width: number; height: number } {
  const size = imageSizeFromBuffer(buffer)
  if (size && size.width > 0 && size.height > 0) return size
  return { width: 1, height: FALLBACK_ASPECT }
}

function bufferFromDataUrl(dataUrl: string): Buffer | null {
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex < 0) return null
  try {
    return Buffer.from(dataUrl.slice(commaIndex + 1), "base64")
  } catch {
    return null
  }
}

/**
 * Origin yang boleh di-fetch server untuk logo: origin app sendiri (logo
 * lokal "/api/uploads/...") dan assetBaseUrl terkonfigurasi (CDN/R2 publik).
 * companyLogo adalah string bebas dari pengaturan, tetapi fetch-nya dipicu
 * user berizin lebih rendah lewat /api/pdf — tanpa allowlist ini nilai itu
 * menjadi blind SSRF GET ke layanan internal setiap laporan dicetak.
 */
function allowedLogoOrigins(origin?: string, assetBaseUrl?: string): Set<string> {
  const allowed = new Set<string>()
  for (const candidate of [origin, assetBaseUrl, process.env.NEXT_PUBLIC_ASSET_BASE_URL]) {
    if (!candidate) continue
    try {
      allowed.add(new URL(candidate).origin)
    } catch {
      // Nilai konfigurasi rusak: abaikan, jangan jadikan celah.
    }
  }
  return allowed
}

export async function resolveDocumentLogo(
  logoUrl: string | null | undefined,
  origin?: string,
  assetBaseUrl?: string | null,
): Promise<DocumentLogo | null> {
  if (!logoUrl) return null

  try {
    if (logoUrl.startsWith("data:")) {
      const buffer = bufferFromDataUrl(logoUrl)
      return buffer ? { dataUrl: logoUrl, ...sizeOf(buffer) } : null
    }

    const url = new URL(logoUrl, origin)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!allowedLogoOrigins(origin, assetBaseUrl ?? undefined).has(url.origin)) return null

    // redirect: "manual" — respons 3xx ke host lain harus berhenti di sini,
    // bukan melompati allowlist origin di atas.
    const response = await fetch(url, { cache: "no-store", redirect: "manual" })
    if (!response.ok) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_LOGO_BYTES) return null

    const contentType = response.headers.get("content-type") || "image/png"
    const dataUrl = `data:${contentType.split(";")[0]};base64,${buffer.toString("base64")}`
    return { dataUrl, ...sizeOf(buffer) }
  } catch {
    return null
  }
}
