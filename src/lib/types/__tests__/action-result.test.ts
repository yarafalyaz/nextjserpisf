import { describe, it, expect } from "vitest"
import { ok, fail } from "@/lib/types/action-result"

describe("action-result helpers", () => {
  it("ok() returns success without data", () => {
    const result = ok()
    expect(result).toEqual({ success: true })
  })

  it("ok(data) returns success with data", () => {
    const result = ok({ id: 1, name: "Test" })
    expect(result).toEqual({ success: true, data: { id: 1, name: "Test" } })
  })

  it("ok(primitive) returns success with primitive data", () => {
    expect(ok(42)).toEqual({ success: true, data: 42 })
    expect(ok("hello")).toEqual({ success: true, data: "hello" })
    expect(ok(null)).toEqual({ success: true, data: null })
  })

  it("fail() returns error", () => {
    const result = fail("Something went wrong")
    expect(result).toEqual({ success: false, error: "Something went wrong" })
  })

  it("fail() with empty string", () => {
    const result = fail("")
    expect(result).toEqual({ success: false, error: "" })
  })
})
