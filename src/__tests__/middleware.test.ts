import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock NextResponse and NextRequest
const mockHeaders = new Map<string, string>()
const mockNextResponse = {
  next: vi.fn(() => ({
    headers: {
      set: (key: string, value: string) => mockHeaders.set(key, value),
      get: (key: string) => mockHeaders.get(key),
    },
  })),
}

vi.mock("next/server", () => ({
  NextResponse: mockNextResponse,
}))

describe("security headers middleware", () => {
  beforeEach(() => {
    mockHeaders.clear()
    vi.resetModules()
  })

  it("sets X-Content-Type-Options header", async () => {
    const { middleware } = await import("@/middleware")
    const req = { nextUrl: { protocol: "http:" } } as never
    middleware(req)
    expect(mockHeaders.get("X-Content-Type-Options")).toBe("nosniff")
  })

  it("sets X-Frame-Options header", async () => {
    const { middleware } = await import("@/middleware")
    const req = { nextUrl: { protocol: "http:" } } as never
    middleware(req)
    expect(mockHeaders.get("X-Frame-Options")).toBe("DENY")
  })

  it("sets Referrer-Policy header", async () => {
    const { middleware } = await import("@/middleware")
    const req = { nextUrl: { protocol: "http:" } } as never
    middleware(req)
    expect(mockHeaders.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin")
  })

  it("sets Permissions-Policy header", async () => {
    const { middleware } = await import("@/middleware")
    const req = { nextUrl: { protocol: "http:" } } as never
    middleware(req)
    expect(mockHeaders.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()")
  })

  it("sets HSTS for https requests", async () => {
    const { middleware } = await import("@/middleware")
    const req = { nextUrl: { protocol: "https:" } } as never
    middleware(req)
    expect(mockHeaders.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains")
  })

  it("does not set HSTS for http requests", async () => {
    const { middleware } = await import("@/middleware")
    const req = { nextUrl: { protocol: "http:" } } as never
    middleware(req)
    expect(mockHeaders.get("Strict-Transport-Security")).toBeUndefined()
  })
})
