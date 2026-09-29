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
