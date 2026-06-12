import { describe, it, expect, beforeEach, vi } from "vitest"
import { takeRateLimit, getClientIp } from "../rate-limit"

describe("takeRateLimit", () => {
  beforeEach(() => {
    // Reset module state between tests by advancing time far enough
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  })

  it("allows requests within the limit", () => {
    const config = { windowMs: 60_000, max: 3 }
    const r1 = takeRateLimit("test-allow", config)
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(2)

    const r2 = takeRateLimit("test-allow", config)
    expect(r2.allowed).toBe(true)
    expect(r2.remaining).toBe(1)

    const r3 = takeRateLimit("test-allow", config)
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it("blocks requests exceeding the limit", () => {
    const config = { windowMs: 60_000, max: 2 }
    takeRateLimit("test-block", config)
    takeRateLimit("test-block", config)

    const r3 = takeRateLimit("test-block", config)
    expect(r3.allowed).toBe(false)
    expect(r3.remaining).toBe(0)
  })

  it("resets after window expires", () => {
    const config = { windowMs: 10_000, max: 1 }
    const r1 = takeRateLimit("test-reset", config)
    expect(r1.allowed).toBe(true)

    const r2 = takeRateLimit("test-reset", config)
    expect(r2.allowed).toBe(false)

    // Advance past the window
    vi.advanceTimersByTime(10_001)

    const r3 = takeRateLimit("test-reset", config)
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it("tracks keys independently", () => {
    const config = { windowMs: 60_000, max: 1 }
    const r1 = takeRateLimit("key-a", config)
    expect(r1.allowed).toBe(true)

    const r2 = takeRateLimit("key-b", config)
    expect(r2.allowed).toBe(true)

    const r3 = takeRateLimit("key-a", config)
    expect(r3.allowed).toBe(false)
  })

  it("returns correct resetAt timestamp", () => {
    const config = { windowMs: 30_000, max: 5 }
    const now = Date.now()
    const result = takeRateLimit("test-reset-at", config)
    expect(result.resetAt).toBe(now + 30_000)
  })
})

describe("getClientIp", () => {
  // H3 fix: x-real-ip and x-forwarded-for are only honored when behind a
  // trusted reverse proxy. Tests below run in trusted-proxy mode.
  beforeEach(() => {
    process.env.TRUSTED_PROXY = "1"
  })

  it("extracts direct TCP IP from req.ip if present", () => {
    const req = new Request("http://localhost") as any
    req.ip = "127.0.0.1"
    expect(getClientIp(req)).toBe("127.0.0.1")
  })

  it("extracts IP from cf-connecting-ip (Cloudflare)", () => {
    const req = new Request("http://localhost", {
      headers: { "cf-connecting-ip": "8.8.8.8" },
    })
    expect(getClientIp(req)).toBe("8.8.8.8")
  })

  it("extracts IP from x-forwarded-for (RIGHTMOST proxy entry, not leftmost spoofed)", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "spoofed, 1.2.3.4, 10.0.0.1" },
    })
    expect(getClientIp(req)).toBe("10.0.0.1")
  })

  it("extracts IP from x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "5.6.7.8" },
    })
    expect(getClientIp(req)).toBe("5.6.7.8")
  })

  it("prefers cf-connecting-ip over x-real-ip and x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: {
        "cf-connecting-ip": "9.9.9.9",
        "x-forwarded-for": "1.1.1.1",
        "x-real-ip": "2.2.2.2",
      },
    })
    expect(getClientIp(req)).toBe("9.9.9.9")
  })

  it("returns 'unknown' when no headers present", () => {
    const req = new Request("http://localhost")
    expect(getClientIp(req)).toBe("unknown")
  })

  it("ignores x-forwarded-for when TRUSTED_PROXY is unset (H3 spoofing prevention)", () => {
    delete process.env.TRUSTED_PROXY
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    })
    expect(getClientIp(req)).toBe("unknown")
  })

  it("ignores x-real-ip when TRUSTED_PROXY is unset (H3 spoofing prevention)", () => {
    delete process.env.TRUSTED_PROXY
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "5.6.7.8" },
    })
    expect(getClientIp(req)).toBe("unknown")
  })

  it("trims whitespace from IP", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "  9.8.7.6  " },
    })
    expect(getClientIp(req)).toBe("9.8.7.6")
  })
})
