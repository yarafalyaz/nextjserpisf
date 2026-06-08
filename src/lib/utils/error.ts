/**
 * Friendly Indonesian messages for common Prisma error codes, so users get a
 * readable toast instead of a raw "Foreign key constraint violated ..." dump.
 */
const PRISMA_ERROR_MESSAGES: Record<string, string> = {
  P2002: "Data dengan nilai tersebut sudah ada.",
  P2003: "Data terkait tidak valid atau tidak ditemukan.",
  P2025: "Data tidak ditemukan.",
  P2014: "Data tidak dapat diubah karena masih terhubung dengan data lain.",
}

export function getErrorMessage(error: unknown, fallback = "Terjadi kesalahan"): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string" && PRISMA_ERROR_MESSAGES[code]) {
      return PRISMA_ERROR_MESSAGES[code]
    }
  }
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
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
