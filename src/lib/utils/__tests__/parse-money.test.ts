import { describe, it, expect } from "vitest"

import { parseMoneyAmount } from "@/lib/utils/parse-money"

describe("parseMoneyAmount", () => {
  it("parses plain digits", () => {
    expect(parseMoneyAmount("2000000")).toBe(2000000)
  })

  it("parses id-ID thousands separators without decimals", () => {
    expect(parseMoneyAmount("2.000.000")).toBe(2000000)
  })

  it("parses id-ID thousands separators with decimal comma", () => {
    expect(parseMoneyAmount("2.000.000,50")).toBe(2000000.5)
  })

  it("keeps a decimal point when it is not a thousands group", () => {
    expect(parseMoneyAmount("2.5")).toBe(2.5)
    expect(parseMoneyAmount("2000000.50")).toBe(2000000.5)
  })

  it("treats a single dot followed by three digits as thousands", () => {
    expect(parseMoneyAmount("2.000")).toBe(2000)
  })

  it("parses a decimal comma without thousands", () => {
    expect(parseMoneyAmount("2,5")).toBe(2.5)
  })

  it("returns null for empty, blank, or non-numeric input", () => {
    expect(parseMoneyAmount("")).toBeNull()
    expect(parseMoneyAmount("   ")).toBeNull()
    expect(parseMoneyAmount(null)).toBeNull()
    expect(parseMoneyAmount("abc")).toBeNull()
  })

  it("accepts numbers directly", () => {
    expect(parseMoneyAmount(1500)).toBe(1500)
  })
})
