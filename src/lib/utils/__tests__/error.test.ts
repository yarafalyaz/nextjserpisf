import { describe, it, expect } from "vitest"
import { getErrorMessage, isNextRedirectError } from "../error"

describe("getErrorMessage", () => {
  it("returns Prisma P2002 message for unique constraint", () => {
    expect(getErrorMessage({ code: "P2002" })).toBe("Data dengan nilai tersebut sudah ada.")
  })

  it("returns Prisma P2003 message for FK constraint", () => {
    expect(getErrorMessage({ code: "P2003" })).toBe("Data terkait tidak valid atau tidak ditemukan.")
  })

  it("returns Prisma P2025 message for not found", () => {
    expect(getErrorMessage({ code: "P2025" })).toBe("Data tidak ditemukan.")
  })

  it("returns Error.message for Error instances", () => {
    expect(getErrorMessage(new Error("something broke"))).toBe("something broke")
  })

  it("returns string directly", () => {
    expect(getErrorMessage("custom error")).toBe("custom error")
  })

  it("returns message property from plain object", () => {
    expect(getErrorMessage({ message: "obj error" })).toBe("obj error")
  })

  it("returns fallback for unknown types", () => {
    expect(getErrorMessage(null)).toBe("Terjadi kesalahan")
    expect(getErrorMessage(123)).toBe("Terjadi kesalahan")
    expect(getErrorMessage(undefined, "Custom fallback")).toBe("Custom fallback")
  })
})

describe("isNextRedirectError", () => {
  it("returns true for NEXT_REDIRECT digest", () => {
    expect(isNextRedirectError({ digest: "NEXT_REDIRECT;/dashboard" })).toBe(true)
  })

  it("returns false for non-redirect errors", () => {
    expect(isNextRedirectError({ digest: "OTHER_DIGEST" })).toBe(false)
    expect(isNextRedirectError(new Error("test"))).toBe(false)
    expect(isNextRedirectError(null)).toBe(false)
    expect(isNextRedirectError(undefined)).toBe(false)
  })
})
