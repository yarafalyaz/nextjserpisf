import { describe, it, expect } from "vitest"
import {
  isMoneyGateModelType,
  moneyGateConfirmBody,
  moneyGateConfirmTitle,
  moneyGateInlineWarning,
} from "../money-gate-warning"

describe("isMoneyGateModelType", () => {
  it("true hanya untuk Journal dan VendorPayment", () => {
    expect(isMoneyGateModelType("Journal")).toBe(true)
    expect(isMoneyGateModelType("VendorPayment")).toBe(true)
    expect(isMoneyGateModelType("PurchaseOrder")).toBe(false)
    expect(isMoneyGateModelType("SalesInvoice")).toBe(false)
    expect(isMoneyGateModelType("")).toBe(false)
    expect(isMoneyGateModelType(null)).toBe(false)
    expect(isMoneyGateModelType(undefined)).toBe(false)
  })
})

describe("moneyGateConfirmBody", () => {
  it("deactivate Journal menyebut jurnal manual bisa diposting tanpa persetujuan", () => {
    const body = moneyGateConfirmBody("deactivate", "Journal")
    expect(body).toContain("gerbang uang mati")
    expect(body).toContain("Jurnal manual bisa diposting tanpa persetujuan")
    expect(body).toContain("workflow aktif pengganti")
  })

  it("delete VendorPayment menyebut pembayaran vendor bisa diposting tanpa persetujuan", () => {
    const body = moneyGateConfirmBody("delete", "VendorPayment")
    expect(body).toContain("gerbang uang mati")
    expect(body).toContain("Pembayaran vendor bisa dikonfirmasi dan diposting tanpa persetujuan")
    expect(body).toContain("dihapus")
  })

  it("judul membedakan hapus vs nonaktifkan", () => {
    expect(moneyGateConfirmTitle("delete")).toContain("Hapus")
    expect(moneyGateConfirmTitle("deactivate")).toContain("Nonaktifkan")
  })

  it("peringatan inline menyebut konfirmasi sebelum menyimpan", () => {
    expect(moneyGateInlineWarning("Journal")).toContain("Peringatan gerbang uang")
    expect(moneyGateInlineWarning("Journal")).toContain("konfirmasi sebelum menyimpan")
  })
})
