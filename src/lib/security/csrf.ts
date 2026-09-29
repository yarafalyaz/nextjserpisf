import { headers } from "next/headers"

/**
 * Origin/Referer CSRF check for server actions.
 *
 * Server actions use POST + SameSite cookies, which already blocks most
 * cross-site CSRF. This adds a defense-in-depth layer by asserting that the
 * Origin or Referer header matches the app's own origin.
 *
 * Call at the top of any server action that performs a sensitive mutation
 * (approve, reject, delete, create financial docs, etc.).
 *
 * Browser form submissions from the same origin carry a matching Origin or
 * Referer header. Cross-origin <form> submissions (classic CSRF) will have a
 * mismatched Origin/Referer and are rejected.
 */
export async function assertCSRF() {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return
  const headersList = await headers()
  const origin = headersList.get("origin")
  const referer = headersList.get("referer")
  const host = headersList.get("host")

  if (!host) return // can't validate without host

  const forwardedProtocol = headersList.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const protocol = forwardedProtocol || "https"
  if (protocol !== "http" && protocol !== "https") {
    throw new Error("CSRF validation failed: invalid request protocol")
  }
  let expectedOrigin: string
  try {
    expectedOrigin = new URL(`${protocol}://${host}`).origin
  } catch {
    throw new Error("CSRF validation failed: invalid request host")
  }

  // No origin or referer — could be a direct server-to-server call or an
  // older browser. Allow it (SameSite cookie is the primary defense).
  if (!origin && !referer) return

  // If origin is present, it must match our origin.
  if (origin) {
    let actualOrigin: string
    try {
      actualOrigin = new URL(origin).origin
    } catch {
      throw new Error("CSRF validation failed: invalid origin")
    }
    if (actualOrigin !== expectedOrigin) {
      console.warn(`[CSRF] Origin mismatch: ${origin} vs ${expectedOrigin}`)
      throw new Error("CSRF validation failed: origin mismatch")
    }
  }

  // If referer is present, it must match our origin.
  if (referer) {
    let refererOrigin: string
    try {
      refererOrigin = new URL(referer).origin
    } catch {
      throw new Error("CSRF validation failed: invalid referer")
    }
    if (refererOrigin !== expectedOrigin) {
      console.warn(`[CSRF] Referer mismatch: ${referer} vs ${expectedOrigin}`)
      throw new Error("CSRF validation failed: referer mismatch")
    }
  }
}
