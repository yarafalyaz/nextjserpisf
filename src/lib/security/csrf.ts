import { headers } from "next/headers"

/**
 * Origin/Referer CSRF check for server actions.
 *
 * Server actions and cookie-authenticated API routes use POST + the
 * default session cookie (Auth.js does not set SameSite explicitly, so
 * browsers apply Lax). This adds a defense-in-depth layer by asserting
 * that the Origin or Referer header matches the app's own origin.
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

  if (!host) throw new Error("CSRF validation failed: missing host")

  // Only honor the proxy scheme stamp under the same TRUSTED_PROXY opt-in
  // that gates client-IP headers in getClientIp(). Without it, a direct
  // client could send `x-forwarded-proto` to shift the expected origin.
  // Defaulting a direct http deployment to "https" compares browser origin
  // `http://...` against a synthetic `https://...` origin and rejects every
  // legitimate mutation, so the scheme is derived from the Origin/Referer
  // itself; anything that cannot be proven same-origin is rejected below.
  const trustedProxy = process.env.TRUSTED_PROXY === "1"
  const forwardedProtocol = trustedProxy
    ? headersList.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase()
    : undefined
  if (forwardedProtocol && forwardedProtocol !== "http" && forwardedProtocol !== "https") {
    throw new Error("CSRF validation failed: invalid request protocol")
  }

  // No origin or referer: a browser mutation POST always carries one of
  // these headers. Missing evidence is therefore an untrusted client, not
  // a legacy browser. Fail closed (cookie-authenticated mutations only).
  if (!origin && !referer) {
    throw new Error("CSRF validation failed: missing origin")
  }

  const source = origin ?? referer!
  let sourceUrl: URL
  try {
    sourceUrl = new URL(source)
  } catch {
    throw new Error(`CSRF validation failed: invalid ${origin ? "origin" : "referer"}`)
  }
  if (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") {
    throw new Error(`CSRF validation failed: invalid ${origin ? "origin" : "referer"}`)
  }

  // Under TRUSTED_PROXY the proxy owns both the public scheme and the public
  // host (x-forwarded-host is written by trusted proxies from the request's
  // public URL; upstream requests reaching the app are already same-origin
  // in that topology). The forwarded stamp only narrows the public host;
  // a forged stamp without TRUSTED_PROXY changes nothing here.
  if (trustedProxy) {
    const publicHost = (headersList.get("x-forwarded-host")?.split(",")[0]?.trim() || host).toLowerCase()
    const scheme = forwardedProtocol ?? sourceUrl.protocol.slice(0, -1)
    if (sourceUrl.protocol !== `${scheme}:` || sourceUrl.host.toLowerCase() !== publicHost) {
      console.warn(`[CSRF] Origin mismatch: ${source} vs ${scheme}://${publicHost}`)
      throw new Error("CSRF validation failed: origin mismatch")
    }
    return
  }

  // Direct (no trusted proxy): browser-set host is the public host. Compare
  // host including the port byte-for-byte; the scheme comes from the source.
  if (sourceUrl.host.toLowerCase() !== host.toLowerCase()) {
    console.warn(`[CSRF] ${origin ? "Origin" : "Referer"} mismatch: ${source} vs ${sourceUrl.protocol}//${host}`)
    throw new Error(`CSRF validation failed: ${origin ? "origin" : "referer"} mismatch`)
  }
}
