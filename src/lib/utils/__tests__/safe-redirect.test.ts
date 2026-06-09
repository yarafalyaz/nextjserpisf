import { describe, it, expect } from "vitest"
import { isSafeInternalPath, safeInternalPath } from "../safe-redirect"

describe("isSafeInternalPath", () => {
  it("accepts valid internal paths", () => {
    expect(isSafeInternalPath("/")).toBe(true)
    expect(isSafeInternalPath("/dashboard")).toBe(true)
    expect(isSafeInternalPath("/penjualan/faktur/123")).toBe(true)
    expect(isSafeInternalPath("/pengaturan?tab=umum")).toBe(true)
    expect(isSafeInternalPath("/path#anchor")).toBe(true)
  })

  it("rejects non-string values", () => {
    expect(isSafeInternalPath(null)).toBe(false)
    expect(isSafeInternalPath(undefined)).toBe(false)
    expect(isSafeInternalPath(123)).toBe(false)
    expect(isSafeInternalPath({})).toBe(false)
  })

  it("rejects empty or whitespace-only strings", () => {
    expect(isSafeInternalPath("")).toBe(false)
    expect(isSafeInternalPath("   ")).toBe(false)
  })

  it("rejects relative paths (no leading /)", () => {
    expect(isSafeInternalPath("dashboard")).toBe(false)
    expect(isSafeInternalPath("../admin")).toBe(false)
  })

  it("rejects absolute URLs", () => {
    expect(isSafeInternalPath("https://evil.com")).toBe(false)
    expect(isSafeInternalPath("http://evil.com/path")).toBe(false)
  })

  it("rejects protocol-relative URLs (//)", () => {
    expect(isSafeInternalPath("//evil.com")).toBe(false)
    expect(isSafeInternalPath("//evil.com/path")).toBe(false)
  })

  it("rejects backslash-normalised open redirects", () => {
    expect(isSafeInternalPath("/\\evil.com")).toBe(false)
  })

  it("rejects control characters", () => {
    expect(isSafeInternalPath("/\tjavascript:alert(1)")).toBe(false)
    expect(isSafeInternalPath("/\x00path")).toBe(false)
    expect(isSafeInternalPath("/\npath")).toBe(false)
  })

  it("rejects embedded scheme patterns", () => {
    expect(isSafeInternalPath("/javascript:alert(1)")).toBe(false)
    expect(isSafeInternalPath("/data:text/html,<h1>hi</h1>")).toBe(false)
  })
})

describe("safeInternalPath", () => {
  it("returns target when safe", () => {
    expect(safeInternalPath("/dashboard", "/")).toBe("/dashboard")
  })

  it("returns fallback when target is unsafe", () => {
    expect(safeInternalPath("//evil.com", "/")).toBe("/")
    expect(safeInternalPath(null, "/login")).toBe("/login")
    expect(safeInternalPath("https://x.com", "/home")).toBe("/home")
  })
})
