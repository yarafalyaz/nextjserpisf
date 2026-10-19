import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ headers: vi.fn() }))

vi.mock("next/headers", () => ({ headers: (...args: unknown[]) => mocks.headers(...args) }))

import { assertCSRF } from "../csrf"

describe("assertCSRF origin validation", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VITEST", "false")
    mocks.headers.mockReset()
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("accepts the exact request origin", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      host: "erp.example.com",
      origin: "https://erp.example.com",
      "x-forwarded-proto": "https",
    }))
    await expect(assertCSRF()).resolves.toBeUndefined()
  })

  it("rejects a hostname that only begins with the trusted hostname", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      host: "erp.example.com",
      origin: "https://erp.example.com.attacker.invalid",
      "x-forwarded-proto": "https",
    }))
    await expect(assertCSRF()).rejects.toThrow("origin mismatch")
  })

  it("rejects a cross-site referer even when no origin is sent", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      host: "erp.example.com",
      referer: "https://attacker.invalid/submit",
      "x-forwarded-proto": "https",
    }))
    await expect(assertCSRF()).rejects.toThrow("referer mismatch")
  })
})

describe("assertCSRF fail-closed (ISF-02)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VITEST", "false")
    mocks.headers.mockReset()
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it("rejects request with no Origin and no Referer", async () => {
    mocks.headers.mockResolvedValue(new Headers({ host: "erp.example.com" }))
    await expect(assertCSRF()).rejects.toThrow("missing origin")
  })

  it("rejects request with no Host", async () => {
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://erp.example.com" }))
    await expect(assertCSRF()).rejects.toThrow("missing host")
  })

  it("accepts direct http origin matching host:port (E2E http runtime)", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      host: "localhost:4101",
      origin: "http://localhost:4101",
    }))
    await expect(assertCSRF()).resolves.toBeUndefined()
  })

  it("rejects foreign port even when hostname matches", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      host: "localhost:4101",
      origin: "http://localhost:9999",
    }))
    await expect(assertCSRF()).rejects.toThrow("origin mismatch")
  })

  it("ignores forged x-forwarded-proto when TRUSTED_PROXY unset", async () => {
    vi.stubEnv("TRUSTED_PROXY", "")
    mocks.headers.mockResolvedValue(new Headers({
      host: "erp.example.com",
      origin: "http://erp.example.com",
      "x-forwarded-proto": "https",
    }))
    await expect(assertCSRF()).resolves.toBeUndefined()
  })

  it("honors forwarded proto+host only when TRUSTED_PROXY=1 (proxy topology)", async () => {
    vi.stubEnv("TRUSTED_PROXY", "1")
    mocks.headers.mockResolvedValue(new Headers({
      host: "app-internal:3000",
      origin: "https://erp.example.com",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "erp.example.com",
    }))
    await expect(assertCSRF()).resolves.toBeUndefined()
  })

  it("under TRUSTED_PROXY rejects origin not matching forwarded host", async () => {
    vi.stubEnv("TRUSTED_PROXY", "1")
    mocks.headers.mockResolvedValue(new Headers({
      host: "app-internal:3000",
      origin: "https://attacker.invalid",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "erp.example.com",
    }))
    await expect(assertCSRF()).rejects.toThrow("origin mismatch")
  })

  it("under TRUSTED_PROXY rejects scheme downgrade vs forwarded proto", async () => {
    vi.stubEnv("TRUSTED_PROXY", "1")
    mocks.headers.mockResolvedValue(new Headers({
      host: "app-internal:3000",
      origin: "http://erp.example.com",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "erp.example.com",
    }))
    await expect(assertCSRF()).rejects.toThrow("origin mismatch")
  })
})
