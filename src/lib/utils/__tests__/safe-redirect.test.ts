import { describe, it, expect } from "vitest"
import { isSafeInternalPath, safeInternalPath } from "../safe-redirect"

describe("isSafeInternalPath", () => {
  it("accepts normal internal paths", () => {
    expect(isSafeInternalPath("/pengaturan")).toBe(true)
    expect(isSafeInternalPath("/keuangan/jurnal")).toBe(true)
    expect(isSafeInternalPath("/")).toBe(true)
    expect(isSafeInternalPath("/a?b=1&c=2")).toBe(true)
  })

  it("rejects protocol-relative URLs", () => {
    expect(isSafeInternalPath("//evil.tld")).toBe(false)
    expect(isSafeInternalPath("//evil.tld/path")).toBe(false)
  })

  it("rejects backslash-relative URLs", () => {
    expect(isSafeInternalPath("/\\evil.tld")).toBe(false)
  })

  it("rejects absolute URLs with scheme", () => {
    expect(isSafeInternalPath("https://evil.tld")).toBe(false)
    expect(isSafeInternalPath("http://evil.tld/path")).toBe(false)
    expect(isSafeInternalPath("javascript:alert(1)")).toBe(false)
  })

  it("rejects relative paths (no leading slash)", () => {
    expect(isSafeInternalPath("pengaturan")).toBe(false)
    expect(isSafeInternalPath("../etc/passwd")).toBe(false)
  })

  it("rejects control characters", () => {
    expect(isSafeInternalPath("/\tjavascript:x")).toBe(false)
    expect(isSafeInternalPath("/\x00bad")).toBe(false)
  })

  it("rejects empty and non-string", () => {
    expect(isSafeInternalPath("")).toBe(false)
    expect(isSafeInternalPath("   ")).toBe(false)
    expect(isSafeInternalPath(null)).toBe(false)
    expect(isSafeInternalPath(undefined)).toBe(false)
    expect(isSafeInternalPath(123)).toBe(false)
  })
})

describe("safeInternalPath", () => {
  it("returns target when safe", () => {
    expect(safeInternalPath("/pengaturan", "/fallback")).toBe("/pengaturan")
  })

  it("returns fallback when unsafe", () => {
    expect(safeInternalPath("//evil.tld", "/pengaturan")).toBe("/pengaturan")
    expect(safeInternalPath(null, "/pengaturan")).toBe("/pengaturan")
  })
})
