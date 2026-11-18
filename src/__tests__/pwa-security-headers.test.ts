import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextRequest } from "next/server"

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(async () => null),
}))

vi.mock("@/lib/security/rate-limit", () => ({
  takeRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 })),
  getClientIp: vi.fn(() => "127.0.0.1"),
  canBlockOnClientIp: vi.fn(() => false),
  clientRateLimitKey: vi.fn(() => "anon"),
  isRateLimitFailClosed: vi.fn(() => false),
  warnRateLimitRedisMissingOnce: vi.fn(),
}))

vi.mock("@/lib/security/secure-request", () => ({
  isSecureRequest: vi.fn(() => false),
}))

vi.mock("@/lib/auth/sensitive-routes", () => ({
  SENSITIVE_ROUTE_PERMISSIONS: {},
}))

vi.mock("@/lib/security/same-origin", () => ({
  isSameOriginRequest: vi.fn(() => true),
}))

import { proxy } from "@/proxy"

describe("PWA security headers & CSP (H8)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sets strict CSP (worker-src 'self', manifest-src 'self'), nosniff, and no-cache headers on /sw.js", async () => {
    const req = new NextRequest("http://localhost:3000/sw.js")
    const res = await proxy(req)

    expect(res.status).toBe(200)
    expect(res.headers.get("Location")).toBeNull()
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-store, must-revalidate")

    const csp = res.headers.get("Content-Security-Policy") ?? ""
    expect(csp).toContain("worker-src 'self'")
    expect(csp).toContain("manifest-src 'self'")
  })

  it("allows /offline and /manifest.webmanifest without session while preserving security headers", async () => {
    for (const pathname of ["/offline", "/manifest.webmanifest"]) {
      const res = await proxy(new NextRequest(`http://localhost:3000${pathname}`))
      expect(res.status).toBe(200)
      expect(res.headers.get("Location")).toBeNull()
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
      expect(res.headers.get("Content-Security-Policy")).toContain("manifest-src 'self'")
    }
  })

  it("checks PUBLIC_METADATA_PATHS before early static extension bypass so /sw.js is not skipped", () => {
    const src = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8")
    expect(src).toMatch(/STATIC_EXTENSIONS\.test\(pathname\)\s*&&\s*!PUBLIC_METADATA_PATHS\.has\(pathname\)/)
  })
})
