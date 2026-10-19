/**
 * Friendly Indonesian messages for common Prisma error codes, so users get a
 * readable toast instead of a raw "Foreign key constraint violated ..." dump.
 */
const PRISMA_ERROR_MESSAGES: Record<string, string> = {
  P2000: "Nilai yang dimasukkan terlalu panjang.",
  P2001: "Data tidak ditemukan.",
  P2002: "Data dengan nilai tersebut sudah ada.",
  P2003: "Data terkait tidak valid atau tidak ditemukan.",
  P2011: "Ada kolom wajib yang tidak boleh kosong.",
  P2012: "Ada data wajib yang belum diisi.",
  P2014: "Data tidak dapat diubah karena masih terhubung dengan data lain.",
  P2016: "Permintaan data tidak valid.",
  P2024: "Koneksi database habis waktu. Coba lagi.",
  P2025: "Data tidak ditemukan.",
  P2034: "Transaksi gagal karena konflik tulis. Coba lagi.",
}

/**
 * Pola pesan teknis (Prisma / driver DB / koneksi) yang tidak boleh sampai ke
 * klien — membocorkan nama tabel, kolom, constraint, atau topologi infra.
 * Pesan aman (mis. validasi bisnis Indonesia) tetap diteruskan apa adanya.
 */
const SENSITIVE_MESSAGE_PATTERNS: RegExp[] = [
  /unique constraint failed on/i,
  /foreign key constraint (violated|failed)/i,
  /null constraint violation/i,
  /missing a required value/i,
  /invalid `?prisma/i,
  /query interpretation/i,
  /unknown (arg|argument|field)/i,
  /invalid argument `/i,
  /duplicate entry/i,
  /unknown column/i,
  /table .* doesn't exist/i,
  /a foreign key constraint fails/i,
  /incorrect .* value/i,
  /out of range value/i,
  /deadlock/i,
  /lock wait timeout/i,
  /write conflict/i,
  /timed out fetching/i,
  /timed out in/i,
  /can't reach database/i,
  /connection (timed out|refused|failed|lost)/i,
  /ECONN[A-Z]*|ETIMEDOUT|ENOTFOUND|EPIPE/,
  /\bP20\d\d\b/,
  /sqlstate/i,
  /you have an error in your sql syntax/i,
  /access denied for user/i,
  /unknown database/i,
  /migration/i,
]

function sanitizeMessage(message: string, fallback: string): string {
  const text = message.trim()
  if (!text) return fallback
  if (SENSITIVE_MESSAGE_PATTERNS.some((pattern) => pattern.test(text))) return fallback
  return text
}

export function getErrorMessage(error: unknown, fallback = "Terjadi kesalahan"): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string" && PRISMA_ERROR_MESSAGES[code]) {
      return PRISMA_ERROR_MESSAGES[code]
    }
  }
  if (error instanceof Error) return sanitizeMessage(error.message, fallback)
  if (typeof error === "string") return sanitizeMessage(error, fallback)
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return sanitizeMessage(message, fallback)
  }
  return fallback
}

export function isNextRedirectError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  )
}
