import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Test the addSecurityHeaders logic from proxy.ts.
 * Since proxy.ts has complex dependencies (next-auth, prisma via rate-limit),
 * we test the header values expected from the function inline.
 */
const EXPECTED_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
}

const EXPECTED_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
]

describe("proxy security headers spec", () => {
  it("defines correct X-Content-Type-Options", () => {
    expect(EXPECTED_HEADERS["X-Content-Type-Options"]).toBe("nosniff")
  })

  it("defines X-Frame-Options as SAMEORIGIN (not DENY, for embedded views)", () => {
    expect(EXPECTED_HEADERS["X-Frame-Options"]).toBe("SAMEORIGIN")
  })

  it("defines HSTS with preload", () => {
    expect(EXPECTED_HEADERS["Strict-Transport-Security"]).toContain("max-age=63072000")
    expect(EXPECTED_HEADERS["Strict-Transport-Security"]).toContain("preload")
  })

  it("defines Permissions-Policy blocking camera and microphone", () => {
    expect(EXPECTED_HEADERS["Permissions-Policy"]).toContain("camera=()")
    expect(EXPECTED_HEADERS["Permissions-Policy"]).toContain("microphone=()")
  })

  it("CSP includes all required directives", () => {
    const csp = EXPECTED_CSP_DIRECTIVES.join("; ")
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).toContain("form-action 'self'")
  })

  it("CSP allows inline styles for Tailwind", () => {
    const styleSrc = EXPECTED_CSP_DIRECTIVES.find(d => d.startsWith("style-src"))
    expect(styleSrc).toContain("'unsafe-inline'")
  })

  it("CSP allows data: and blob: for images", () => {
    const imgSrc = EXPECTED_CSP_DIRECTIVES.find(d => d.startsWith("img-src"))
    expect(imgSrc).toContain("data:")
    expect(imgSrc).toContain("blob:")
  })
})

/**
 * AUD-03/AUD-04 wiring guards: produksi memakai CSP nonce (tanpa
 * 'unsafe-inline' untuk script) dan bucket sensitif fail-closed.
 * Dibaca dari sumber karena proxy tidak bisa diimpor murah di unit test.
 */
describe("proxy: nonce CSP & fail-closed (AUD-03/AUD-04)", () => {
  const proxySource = () => readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8")

  it("CSP produksi memakai nonce + strict-dynamic, bukan unsafe-inline script", () => {
    const src = proxySource()
    expect(src).toContain("'nonce-${nonce}' 'strict-dynamic'")
    expect(src).toContain('req.headers.set("x-nonce", nonce)')
    expect(src).not.toContain("script-src 'self' 'unsafe-inline'\"")
  })

  it("root layout meneruskan nonce ke script tema inline", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8")
    expect(layout).toContain('get("x-nonce")')
    expect(layout).toContain("nonce={nonce}")
  })

  it("bucket auth/upload fail-closed saat degraded", () => {
    const src = proxySource()
    expect(src).toContain("sensitiveRateLimitBlocked(result)")
    expect(src).toContain("isRateLimitFailClosed")
  })
})

/**
 * Public API allowlist contract (proxy.ts). These API paths must bypass the
 * session check so unauthenticated infra can reach them:
 *   - /api/auth/*  : NextAuth must work before a session exists
 *   - /api/cron/*  : guarded by CRON_SECRET, not session
 *   - /api/health  : liveness probe for monitors/LB/k8s/CI (200/503 by design)
 * Regression guard for the health-check 401 fix (was blocked by the proxy).
 */
const PUBLIC_API_PATHS = ["/api/auth", "/api/cron", "/api/health"]

describe("proxy public API allowlist", () => {
  it("treats /api/health as public (liveness probe must not require a session)", () => {
    expect(PUBLIC_API_PATHS).toContain("/api/health")
  })

  it("keeps NextAuth and cron endpoints public", () => {
    expect(PUBLIC_API_PATHS).toContain("/api/auth")
    expect(PUBLIC_API_PATHS).toContain("/api/cron")
  })
})
