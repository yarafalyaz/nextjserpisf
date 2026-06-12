import { describe, it, expect } from "vitest"
import {
  safeNumber,
  requireNumber,
  safeId,
  requireId,
  requireString,
  safeJsonParse,
  requireJsonParse,
  parseValidItems,
} from "../safe-parse"

describe("safeNumber", () => {
  it("parses valid numbers", () => {
    expect(safeNumber("123")).toBe(123)
    expect(safeNumber("0")).toBe(0)
    expect(safeNumber("-5.5")).toBe(-5.5)
  })

  it("returns null for empty/null/undefined", () => {
    expect(safeNumber(null)).toBeNull()
    expect(safeNumber(undefined)).toBeNull()
    expect(safeNumber("")).toBeNull()
  })

  it("returns null for NaN/Infinity", () => {
    expect(safeNumber("abc")).toBeNull()
    expect(safeNumber("Infinity")).toBeNull()
    expect(safeNumber("NaN")).toBeNull()
  })
})

describe("requireNumber", () => {
  it("returns number for valid input", () => {
    expect(requireNumber("42", "qty")).toBe(42)
  })

  it("throws for invalid input", () => {
    expect(() => requireNumber("abc", "qty")).toThrow("qty")
    expect(() => requireNumber(null, "qty")).toThrow("qty")
  })
})

describe("safeId", () => {
  it("parses valid positive integers", () => {
    expect(safeId("1")).toBe(1)
    expect(safeId("999")).toBe(999)
  })

  it("returns null for zero/negative/decimal", () => {
    expect(safeId("0")).toBeNull()
    expect(safeId("-1")).toBeNull()
    expect(safeId("1.5")).toBeNull()
  })

  it("returns null for non-numeric", () => {
    expect(safeId("abc")).toBeNull()
    expect(safeId(null)).toBeNull()
    expect(safeId("")).toBeNull()
  })
})

describe("requireId", () => {
  it("returns id for valid input", () => {
    expect(requireId("5", "userId")).toBe(5)
  })

  it("throws for invalid input", () => {
    expect(() => requireId("0", "userId")).toThrow("userId")
    expect(() => requireId("abc", "userId")).toThrow("userId")
  })
})

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 })
    expect(safeJsonParse("[1,2,3]")).toEqual([1, 2, 3])
    expect(safeJsonParse('"hello"')).toBe("hello")
  })

  it("returns null for invalid JSON", () => {
    expect(safeJsonParse("{invalid}")).toBeNull()
    expect(safeJsonParse("not json")).toBeNull()
  })

  it("returns null for null/undefined/empty", () => {
    expect(safeJsonParse(null)).toBeNull()
    expect(safeJsonParse(undefined)).toBeNull()
    expect(safeJsonParse("")).toBeNull()
  })
})

describe("requireJsonParse", () => {
  it("returns parsed value for valid JSON", () => {
    expect(requireJsonParse('{"x":true}', "config")).toEqual({ x: true })
  })

  it("throws for invalid JSON", () => {
    expect(() => requireJsonParse("bad", "config")).toThrow("config")
    expect(() => requireJsonParse(null, "config")).toThrow("config")
  })
})

describe("requireString", () => {
  it("returns the trimmed string for valid input", () => {
    expect(requireString("  hello  ", "name")).toBe("hello")
    expect(requireString("world", "name")).toBe("world")
  })

  it("throws when the value is empty or whitespace-only", () => {
    expect(() => requireString("", "name")).toThrow(/name.*wajib diisi/)
    expect(() => requireString("   ", "name")).toThrow(/name.*wajib diisi/)
  })

  it("throws when the value is null, undefined, or a non-string (File)", () => {
    expect(() => requireString(null, "name")).toThrow("name")
    expect(() => requireString(undefined, "name")).toThrow("name")
    const file = new File([new Uint8Array(4)], "x.png", { type: "image/png" })
    expect(() => requireString(file, "name")).toThrow("name")
  })
})

describe("parseValidItems", () => {
  it("parses and keeps only items with a positive itemId and qty", () => {
    const json = JSON.stringify([
      { itemId: 1, qty: 2 },
      { itemId: 3, qty: 4.5 },
    ])
    expect(parseValidItems(json)).toEqual([
      { itemId: 1, qty: 2 },
      { itemId: 3, qty: 4.5 },
    ])
  })

  it("filters out items with non-positive or non-finite itemId/qty", () => {
    const json = JSON.stringify([
      { itemId: 1, qty: 2 },
      { itemId: 0, qty: 5 },
      { itemId: -3, qty: 5 },
      { itemId: 4, qty: 0 },
      { itemId: 5, qty: -1 },
    ])
    expect(parseValidItems(json)).toEqual([{ itemId: 1, qty: 2 }])
  })

  it("filters out non-object entries and entries missing fields", () => {
    const json = JSON.stringify([
      { itemId: 1, qty: 2 },
      null,
      42,
      "nope",
      { itemId: 9 },
      { qty: 9 },
      { itemId: "7", qty: 1 },
    ])
    expect(parseValidItems(json)).toEqual([{ itemId: 1, qty: 2 }])
  })

  it("returns an empty array for malformed JSON, null, or a non-array payload", () => {
    expect(parseValidItems("{bad json")).toEqual([])
    expect(parseValidItems(null)).toEqual([])
    expect(parseValidItems(undefined)).toEqual([])
  })
})
