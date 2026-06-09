import { describe, it, expect } from "vitest"
import { paymentMethodLabel, shippingMethodLabel } from "../method-labels"

describe("paymentMethodLabel", () => {
  it("returns friendly label for known codes", () => {
    expect(paymentMethodLabel("transfer")).toBe("Transfer Bank")
    expect(paymentMethodLabel("cash")).toBe("Tunai")
    expect(paymentMethodLabel("check")).toBe("Cek/Giro")
    expect(paymentMethodLabel("giro")).toBe("Giro")
    expect(paymentMethodLabel("card")).toBe("Kartu Kredit/Debit")
    expect(paymentMethodLabel("ewallet")).toBe("E-Wallet")
    expect(paymentMethodLabel("termin")).toBe("Termin/Tempo")
  })

  it("falls back to raw value for unknown codes", () => {
    expect(paymentMethodLabel("bitcoin")).toBe("bitcoin")
    expect(paymentMethodLabel("Custom Method")).toBe("Custom Method")
  })

  it("returns empty string for null/undefined/empty", () => {
    expect(paymentMethodLabel(null)).toBe("")
    expect(paymentMethodLabel(undefined)).toBe("")
    expect(paymentMethodLabel("")).toBe("")
  })
})

describe("shippingMethodLabel", () => {
  it("returns friendly label for known codes", () => {
    expect(shippingMethodLabel("pickup")).toBe("Ambil Sendiri")
    expect(shippingMethodLabel("courier")).toBe("Kurir")
    expect(shippingMethodLabel("expedition")).toBe("Ekspedisi/Cargo")
    expect(shippingMethodLabel("delivery")).toBe("Diantar")
  })

  it("falls back to raw value for unknown codes", () => {
    expect(shippingMethodLabel("drone")).toBe("drone")
  })

  it("returns empty string for null/undefined/empty", () => {
    expect(shippingMethodLabel(null)).toBe("")
    expect(shippingMethodLabel(undefined)).toBe("")
    expect(shippingMethodLabel("")).toBe("")
  })
})
