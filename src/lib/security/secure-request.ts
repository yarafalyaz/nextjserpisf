/**
 * Request-scheme helpers.
 *
 * Auth.js decides between the `authjs.session-token` and
 * `__Secure-authjs.session-token` cookie based on how the request arrived (its
 * protocol), NOT on NODE_ENV. Any code that reads those cookies - the proxy
 * verifying the session with getToken, and the HSTS /
 * `upgrade-insecure-requests` headers - must use the same rule, otherwise a
 * production build served over plain HTTP (the e2e/CI server, or an on-prem
 * install without TLS) looks for `__Secure-` cookies that were never set and
 * bounces every page back to /login.
 */

type RequestLike = {
  headers: { get(name: string): string | null }
  nextUrl?: { protocol?: string }
  url?: string
}

/** True when the request reached the app over TLS. */
export function isSecureRequest(req: RequestLike): boolean {
  // Behind a proxy (Cloudflare / nginx) the original scheme arrives here; take
  // the first entry since `x-forwarded-proto` may be a comma-separated chain.
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase()
  if (forwarded) return forwarded === "https"

  const protocol = req.nextUrl?.protocol
  if (protocol) return protocol === "https:"

  if (req.url) {
    try {
      return new URL(req.url).protocol === "https:"
    } catch {
      return false
    }
  }
  return false
}
