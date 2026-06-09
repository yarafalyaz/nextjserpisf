import { describe, it, expect } from "vitest"
import {
  formatCurrency,
  formatNumber,
  formatDate,
  formatPercentage,
  formatFileSize,
  truncate,
  formatPhone,
  getInitials,
  getStatusColor,
  formatPeriod,
} from "../format"

describe("formatCurrency", () => {
  it("formats basic number", () => {
    expect(formatCurrency(1500000)).toBe("Rp 1.500.000")
  })

  it("handles null/undefined", () => {
    expect(formatCurrency(null)).toBe("Rp 0")
    expect(formatCurrency(undefined)).toBe("Rp 0")
  })

  it("handles string input", () => {
    expect(formatCurrency("250000")).toBe("Rp 250.000")
  })

  it("handles NaN", () => {
    expect(formatCurrency("abc")).toBe("Rp 0")
  })

  it("respects decimals option", () => {
    expect(formatCurrency(1500.5, { decimals: 2 })).toMatch(/1\.500,50/)
  })

  it("hides symbol when showSymbol=false", () => {
    expect(formatCurrency(1000, { showSymbol: false })).toBe("1.000")
  })

  it("uses custom symbol", () => {
    expect(formatCurrency(100, { symbol: "$ " })).toBe("$ 100")
  })
})

describe("formatNumber", () => {
  it("formats with thousands separator", () => {
    expect(formatNumber(1500000)).toBe("1.500.000")
  })

  it("handles decimals", () => {
    expect(formatNumber(1500.5, 1)).toMatch(/1\.500,5/)
  })

  it("handles null/NaN", () => {
    expect(formatNumber(null)).toBe("0")
    expect(formatNumber("abc")).toBe("0")
  })
})

describe("formatDate", () => {
  it("returns - for null", () => {
    expect(formatDate(null)).toBe("-")
  })

  it("returns - for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("-")
  })

  it("formats date string in long format", () => {
    const result = formatDate("2024-01-15")
    expect(result).toContain("2024")
    expect(result).toContain("Januari")
  })

  it("formats in short format", () => {
    const result = formatDate("2024-01-15", { format: "short" })
    expect(result).toContain("2024")
    expect(result).toContain("Jan")
  })

  it("includes time when requested", () => {
    const result = formatDate("2024-01-15T14:30:00", { includeTime: true })
    expect(result).toContain("14")
    expect(result).toContain("30")
  })
})

describe("formatPercentage", () => {
  it("formats percentage value", () => {
    expect(formatPercentage(11.5)).toMatch(/11,5%/)
  })

  it("handles fraction mode", () => {
    expect(formatPercentage(0.115, 1, true)).toMatch(/11,5%/)
  })

  it("handles null/NaN", () => {
    expect(formatPercentage(null)).toBe("0,0%")
    expect(formatPercentage("abc")).toBe("0%")
  })
})

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(0)).toBe("0 B")
    expect(formatFileSize(500)).toBe("500 B")
  })

  it("formats KB", () => {
    expect(formatFileSize(1024)).toBe("1 KB")
  })

  it("formats MB", () => {
    expect(formatFileSize(1048576)).toBe("1 MB")
  })

  it("formats GB", () => {
    expect(formatFileSize(1073741824)).toBe("1 GB")
  })
})

describe("truncate", () => {
  it("returns empty for null", () => {
    expect(truncate(null)).toBe("")
    expect(truncate(undefined)).toBe("")
  })

  it("doesn't truncate short strings", () => {
    expect(truncate("hello", 10)).toBe("hello")
  })

  it("truncates long strings with ellipsis", () => {
    expect(truncate("a very long string here", 10)).toBe("a very lon...")
  })
})

describe("formatPhone", () => {
  it("returns - for null", () => {
    expect(formatPhone(null)).toBe("-")
  })

  it("formats phone number", () => {
    expect(formatPhone("08123456789")).toBe("0812-3456-789")
  })

  it("handles short numbers", () => {
    expect(formatPhone("0812")).toBe("0812")
    expect(formatPhone("08123456")).toBe("0812-3456")
  })
})

describe("getInitials", () => {
  it("returns ? for null", () => {
    expect(getInitials(null)).toBe("?")
  })

  it("returns initials from name", () => {
    expect(getInitials("John Doe")).toBe("JD")
  })

  it("limits to 2 chars", () => {
    expect(getInitials("A B C D")).toBe("AB")
  })
})

describe("getStatusColor", () => {
  it("returns correct color for known status", () => {
    expect(getStatusColor("draft")).toBe("default")
    expect(getStatusColor("approved")).toBe("success")
    expect(getStatusColor("cancelled")).toBe("danger")
  })

  it("returns default for unknown status", () => {
    expect(getStatusColor("unknown")).toBe("default")
  })
})

describe("formatPeriod", () => {
  it("formats YYYY-MM to Indonesian month year", () => {
    expect(formatPeriod("2026-05")).toBe("Mei 2026")
    expect(formatPeriod("2026-12")).toBe("Desember 2026")
    expect(formatPeriod("2026-01")).toBe("Januari 2026")
  })

  it("returns - for null", () => {
    expect(formatPeriod(null)).toBe("-")
  })

  it("returns original for invalid format", () => {
    expect(formatPeriod("invalid")).toBe("invalid")
  })
})
