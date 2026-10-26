import { describe, expect, it } from "vitest"

import { assessCustomerCreditGate } from "@/lib/reports/customer-credit-gate"
import {
  buildCustomerCreditExposure,
  CREDIT_EXPOSURE_STATUS_LABEL,
  type CustomerCreditExposureInput,
} from "@/lib/reports/customer-receivables"

// F-2026-10-25-035-S / vonis F-2026-10-25-035-V (Q-CL2-1): inti penahan =
// PaparanBersih advisory persis; unset & warning tidak ditahan; hanya over
// dapat ditahan, dan hanya bila gerbang aktif (Q-CL2-5 Lead, belum terputus).

const base = (over: Partial<CustomerCreditExposureInput> = {}): CustomerCreditExposureInput => ({
  customerId: 1,
  customerName: "PT Fleet",
  creditLimit: 100,
  outstanding: 0,
  overdue: 0,
  invoiceCount: 0,
  openOrderAmount: 0,
  ...over,
})

const rowOf = (over: Partial<CustomerCreditExposureInput> = {}) =>
  buildCustomerCreditExposure([base(over)])[0]

describe("F-035-S penilaian gerbang kredit (lapis aman, gerbang nonaktif default)", () => {
  it("AC-CL2-B1: gerbang nonaktif -> pelanggan over TIDAK tertahan (perilaku hari ini)", () => {
    const a = assessCustomerCreditGate(rowOf({ outstanding: 150 }))
    expect(a).toMatchObject({ status: "over", blocked: false, reason: "gate_inactive" })
  })

  it("gerbang aktif: hanya over tertahan; ok lolos", () => {
    expect(assessCustomerCreditGate(rowOf({ outstanding: 150 }), { gateEnabled: true })).toMatchObject({
      status: "over",
      blocked: true,
      reason: "credit_limit_exceeded",
    })
    expect(assessCustomerCreditGate(rowOf({ outstanding: 50 }), { gateEnabled: true })).toMatchObject({
      status: "ok",
      blocked: false,
      reason: "within_limit",
    })
  })

  it("vonis 035-V: unset (limit 0) TIDAK ditahan walau gerbang aktif dan paparan besar", () => {
    const a = assessCustomerCreditGate(rowOf({ creditLimit: 0, outstanding: 99_999 }), { gateEnabled: true })
    expect(a).toMatchObject({ status: "unset", blocked: false, reason: "within_limit" })
  })

  it("vonis 035-V: warning (>=80 <100) TIDAK ditahan walau gerbang aktif", () => {
    const a = assessCustomerCreditGate(rowOf({ outstanding: 85 }), { gateEnabled: true })
    expect(a).toMatchObject({ status: "warning", blocked: false, reason: "within_limit" })
  })

  it("ambang builder: 79.99 ok lolos, tepat 100 over tertahan (gerbang aktif)", () => {
    expect(assessCustomerCreditGate(rowOf({ outstanding: 79.99 }), { gateEnabled: true }).blocked).toBe(false)
    expect(assessCustomerCreditGate(rowOf({ outstanding: 100 }), { gateEnabled: true }).blocked).toBe(true)
  })

  it("falsifikasi komponen: tanpa K5 pelanggan WO-berjalan over lolos; dengan K5 tertahan", () => {
    // K1=0, K2=0, K5=120 vs limit 100 -> over hanya karena K5.
    const withK5 = assessCustomerCreditGate(rowOf({ woUnrepresented: 120 }), { gateEnabled: true })
    const withoutK5 = assessCustomerCreditGate(rowOf({ woUnrepresented: 0 }), { gateEnabled: true })
    expect(withK5).toMatchObject({ exposure: 120, status: "over", blocked: true })
    expect(withoutK5).toMatchObject({ exposure: 0, status: "ok", blocked: false })
  })

  it("falsifikasi pengurang: K3(b)/K4 melepaskan dokumen yang kasarnya over", () => {
    // Kasar 60+50=110 over; K3 60 -> bersih 50 ok; K4 25 atas 110 -> 85 warning (tetap lolos).
    expect(
      assessCustomerCreditGate(rowOf({ outstanding: 60, openOrderAmount: 50, confirmedDownPayment: 60 }), {
        gateEnabled: true,
      }),
    ).toMatchObject({ exposure: 50, status: "ok", blocked: false })
    expect(
      assessCustomerCreditGate(rowOf({ outstanding: 60, openOrderAmount: 50, openCustomerCredit: 25 }), {
        gateEnabled: true,
      }),
    ).toMatchObject({ exposure: 85, status: "warning", blocked: false })
  })

  it("angka lama = angka baru: exposure/utilization identik builder advisory (tanpa hitung ulang)", () => {
    const row = rowOf({
      outstanding: 60,
      openOrderAmount: 50,
      woUnrepresented: 30,
      confirmedDownPayment: 20,
      openCustomerCredit: 10,
    })
    const a = assessCustomerCreditGate(row, { gateEnabled: true })
    expect(a.exposure).toBe(row.exposure) // max(0, 60+50+30-20-10) = 110
    expect(a.exposure).toBe(110)
    expect(a.utilization).toBe(row.utilization)
    expect(a.creditLimit).toBe(row.creditLimit)
    expect(a.statusLabel).toBe(CREDIT_EXPOSURE_STATUS_LABEL[row.status])
    expect(a.statusLabel).toBe("Lewat batas")
  })
})
