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
  it("extracts IP from x-forwarded-for (first entry)", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    })
    expect(getClientIp(req)).toBe("1.2.3.4")
  })

  it("extracts IP from x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "5.6.7.8" },
    })
    expect(getClientIp(req)).toBe("5.6.7.8")
  })

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "1.1.1.1",
        "x-real-ip": "2.2.2.2",
      },
    })
    expect(getClientIp(req)).toBe("1.1.1.1")
  })

  it("returns 'unknown' when no headers present", () => {
    const req = new Request("http://localhost")
    expect(getClientIp(req)).toBe("unknown")
  })

  it("trims whitespace from IP", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "  9.8.7.6  " },
    })
    expect(getClientIp(req)).toBe("9.8.7.6")
  })
})
