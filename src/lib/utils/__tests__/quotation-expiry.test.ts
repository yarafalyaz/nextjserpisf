import { describe, it, expect } from "vitest"
import { isQuotationExpired } from "../quotation-expiry"

const now = new Date("2026-10-20T03:00:00Z") // 10:00 WIB

describe("isQuotationExpired", () => {
  it("kosong / tak valid = belum lewat", () => {
    expect(isQuotationExpired(null, now)).toBe(false)
    expect(isQuotationExpired(undefined, now)).toBe(false)
    expect(isQuotationExpired("bukan-tanggal", now)).toBe(false)
  })
  it("hari validUntil sendiri masih berlaku (WIB)", () => {
    expect(isQuotationExpired(new Date(Date.UTC(2026, 9, 20)), now)).toBe(false)
  })
  it("kemarin WIB sudah lewat, besok belum", () => {
    expect(isQuotationExpired(new Date(Date.UTC(2026, 9, 19)), now)).toBe(true)
    expect(isQuotationExpired(new Date(Date.UTC(2026, 9, 21)), now)).toBe(false)
  })
  it("menerima string ISO dari serialisasi RSC", () => {
    expect(isQuotationExpired("2026-10-19T00:00:00.000Z", now)).toBe(true)
  })
})
