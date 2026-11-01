import { describe, it, expect } from "vitest"
import { isSecureRequest } from "../secure-request"

/**
 * Regression guard for the login loop: the proxy derived `secureCookie` from
 * NODE_ENV, but Auth.js derives the `__Secure-` cookie prefix from the request
 * scheme. On a production build served over plain HTTP the two disagreed, so
 * getToken never found the session cookie and every page bounced to /login.
 */

function req(headers: Record<string, string>, url = "http://localhost:4101/") {
  const h = new Headers(headers)
  return {
    headers: { get: (name: string) => h.get(name) },
    nextUrl: { protocol: new URL(url).protocol },
    url,
  }
}

describe("isSecureRequest", () => {
  // x-forwarded-proto hanya dipercaya di balik proxy tepercaya (TRUSTED_PROXY=1),
  // pola yang sama dengan getClientIp()/assertCSRF(). Tanpa gerbang itu klien
  // langsung bisa memalsukan skema: nama cookie sesi yang dicari getToken
  // berubah (__Secure- vs polos) dan HSTS hilang dari responsnya sendiri.
  it("ignores x-forwarded-proto without TRUSTED_PROXY", () => {
    delete process.env.TRUSTED_PROXY
    expect(isSecureRequest(req({ "x-forwarded-proto": "https" }))).toBe(false)
    expect(isSecureRequest(req({ "x-forwarded-proto": "http" }, "https://erp.example.com/"))).toBe(true)
  })

  it("trusts x-forwarded-proto from a TLS-terminating proxy under TRUSTED_PROXY", () => {
    process.env.TRUSTED_PROXY = "1"
    try {
      expect(isSecureRequest(req({ "x-forwarded-proto": "https" }))).toBe(true)
      expect(isSecureRequest(req({ "x-forwarded-proto": "http" }))).toBe(false)
    } finally {
      delete process.env.TRUSTED_PROXY
    }
  })

  it("uses the first value of a comma-separated chain", () => {
    process.env.TRUSTED_PROXY = "1"
    try {
      expect(isSecureRequest(req({ "x-forwarded-proto": "https, http" }))).toBe(true)
      expect(isSecureRequest(req({ "x-forwarded-proto": "HTTP, HTTPS" }))).toBe(false)
    } finally {
      delete process.env.TRUSTED_PROXY
    }
  })

  it("ignores surrounding whitespace and casing", () => {
    process.env.TRUSTED_PROXY = "1"
    try {
      expect(isSecureRequest(req({ "x-forwarded-proto": " HTTPS " }))).toBe(true)
    } finally {
      delete process.env.TRUSTED_PROXY
    }
  })

  it("falls back to the request URL scheme", () => {
    expect(isSecureRequest(req({}, "https://erp.example.com/dashboard"))).toBe(true)
    expect(isSecureRequest(req({}, "http://localhost:4101/dashboard"))).toBe(false)
  })

  it("treats a malformed URL as insecure", () => {
    expect(isSecureRequest({ headers: { get: () => null }, url: "not a url" })).toBe(false)
  })

  it("is insecure when nothing indicates TLS", () => {
    expect(isSecureRequest({ headers: { get: () => null } })).toBe(false)
  })
})
