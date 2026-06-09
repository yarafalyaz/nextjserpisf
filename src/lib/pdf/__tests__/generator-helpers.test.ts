import { describe, it, expect } from "vitest"
import {
  formatPdfCurrency,
  formatPdfDate,
  imgFormat,
} from "../generator"

describe("formatPdfCurrency", () => {
  it("formats a number as Rupiah with symbol by default", () => {
    expect(formatPdfCurrency(1500000)).toBe("Rp 1.500.000")
  })

  it("omits the symbol when showSymbol is false", () => {
    expect(formatPdfCurrency(1500000, false)).toBe("1.500.000")
  })

  it("rounds to whole rupiah (no fraction digits)", () => {
    expect(formatPdfCurrency(1234.99)).toBe("Rp 1.235")
  })

  it("coerces null/NaN-like input to zero", () => {
    expect(formatPdfCurrency(NaN)).toBe("Rp 0")
    expect(formatPdfCurrency(0)).toBe("Rp 0")
  })
})

describe("formatPdfDate", () => {
  it("formats a valid ISO date as DD-Mon-YY", () => {
    expect(formatPdfDate("2026-06-09")).toBe("09-Jun-26")
  })

  it("returns the raw value when the date is invalid", () => {
    expect(formatPdfDate("not-a-date")).toBe("not-a-date")
  })

  it("returns a dash for an empty invalid value", () => {
    expect(formatPdfDate("")).toBe("-")
  })
})

describe("imgFormat", () => {
  it("maps jpeg/jpg data urls to JPEG", () => {
    expect(imgFormat("data:image/jpeg;base64,xxx")).toBe("JPEG")
    expect(imgFormat("data:image/jpg;base64,xxx")).toBe("JPEG")
  })

  it("maps webp data urls to WEBP", () => {
    expect(imgFormat("data:image/webp;base64,xxx")).toBe("WEBP")
  })

  it("maps png data urls to PNG", () => {
    expect(imgFormat("data:image/png;base64,xxx")).toBe("PNG")
  })

  it("defaults to PNG for unknown or malformed data urls", () => {
    expect(imgFormat("data:image/bmp;base64,xxx")).toBe("PNG")
    expect(imgFormat("garbage")).toBe("PNG")
  })
})
