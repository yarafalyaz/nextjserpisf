import { describe, it, expect } from "vitest"
import {
  SETTLEMENT_TOLERANCE_IDR,
  settlementOutstanding,
  isSettled,
  derivePaymentStatus,
} from "../settlement-status"

describe("FIN-BR-006 settlement-status", () => {
  it("toleransi eksplisit Rp1 terdokumentasi sebagai konstanta bernama", () => {
    expect(SETTLEMENT_TOLERANCE_IDR).toBe(1)
  })

  it("lunas tepat saat outstanding 0", () => {
    expect(settlementOutstanding(1000, 1000)).toBe(0)
    expect(isSettled(1000, 1000)).toBe(true)
    expect(derivePaymentStatus(1000, 1000)).toBe("paid")
  })

  it("dalam toleransi (sisa 0,50 dan tepat 1,00) -> lunas", () => {
    expect(isSettled(999999.5, 999999)).toBe(true)
    expect(derivePaymentStatus(1000, 999)).toBe("paid")
    expect(derivePaymentStatus(1000, 999.5)).toBe("paid")
  })

  it("di luar toleransi (sisa 1,01) -> belum lunas", () => {
    expect(isSettled(1000, 998.99)).toBe(false)
    expect(derivePaymentStatus(1000, 998.99)).toBe("partial")
  })

  it("belum ada pembayaran valid -> posted, bukan paid walau grandTotal kecil", () => {
    expect(derivePaymentStatus(1000, 0)).toBe("posted")
    expect(derivePaymentStatus(0, 0)).toBe("posted")
    expect(isSettled(0, 0)).toBe(false)
  })

  it("overpay tetap lunas; outstanding negatif jujur", () => {
    expect(settlementOutstanding(1000, 1000.5)).toBe(-0.5)
    expect(derivePaymentStatus(1000, 1000.5)).toBe("paid")
  })

  it("presisi sen: 0.1 + 0.7 melunasi 0.8 (tanpa drift float)", () => {
    expect(derivePaymentStatus(0.8, 0.1 + 0.7)).toBe("paid")
  })
})
