import { describe, it, expect } from "vitest"
import { isSameOriginRequest } from "../same-origin"

function req(headers: Record<string, string>) {
  return { headers: new Headers(headers) }
}

describe("isSameOriginRequest", () => {
  it("menganggap same-origin berasal dari aplikasi", () => {
    expect(isSameOriginRequest(req({ "sec-fetch-site": "same-origin" }))).toBe(true)
  })

  it("menganggap navigasi langsung (none) berasal dari aplikasi", () => {
    expect(isSameOriginRequest(req({ "sec-fetch-site": "none" }))).toBe(true)
  })

  // Inti perbaikan logout CSRF: permintaan lintas-situs tidak boleh dianggap
  // berasal dari aplikasi, sehingga tidak boleh menghapus cookie sesi.
  it("menolak permintaan lintas-situs", () => {
    expect(isSameOriginRequest(req({ "sec-fetch-site": "cross-site" }))).toBe(false)
    expect(isSameOriginRequest(req({ "sec-fetch-site": "same-site" }))).toBe(false)
  })

  it("fallback: memakai Origin saat Sec-Fetch-Site tidak ada", () => {
    expect(
      isSameOriginRequest(req({ host: "app.test:3005", origin: "http://app.test:3005" })),
    ).toBe(true)
    expect(
      isSameOriginRequest(req({ host: "app.test:3005", origin: "http://evil.test" })),
    ).toBe(false)
  })

  it("fallback: memakai Referer saat Origin tidak ada", () => {
    expect(
      isSameOriginRequest(req({ host: "app.test:3005", referer: "http://app.test:3005/login?reason=x" })),
    ).toBe(true)
    expect(
      isSameOriginRequest(req({ host: "app.test:3005", referer: "http://evil.test/page" })),
    ).toBe(false)
  })

  it("fail-closed bila tidak ada bukti sama sekali", () => {
    expect(isSameOriginRequest(req({}))).toBe(false)
    expect(isSameOriginRequest(req({ host: "app.test:3005" }))).toBe(false)
    expect(isSameOriginRequest(req({ origin: "bukan-url" }))).toBe(false)
  })
})
