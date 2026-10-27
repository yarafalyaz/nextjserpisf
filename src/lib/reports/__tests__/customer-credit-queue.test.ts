import { describe, it, expect } from "vitest"
import {
  CUSTOMER_CREDIT_FP_UM_MARKER_TEXT,
  CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL,
  buildCustomerCreditQueue,
  type CustomerCreditQueueFpUmInput,
  type CustomerCreditQueueItemInput,
} from "../customer-credit-queue"

/**
 * F-2026-10-27-083-S (BR-CCQ-01/03/04, EC-CCQ-2) + vonis Accountant
 * F-2026-10-27-085-V Putusan 1/2/4/5 falsifikasi V1/V3/V5 (lapis builder).
 * Now tetap: 2026-10-27 WIB = 2026-10-26T20:00Z.
 */
const NOW = new Date("2026-10-26T20:00:00.000Z")

function credit(
  partial: Partial<CustomerCreditQueueItemInput> & { creditId: number },
): CustomerCreditQueueItemInput {
  return {
    documentNo: `CC-${partial.creditId}`,
    customerId: 1,
    customerName: "Budi",
    sourceType: "DownPayment",
    sourceId: 10,
    receivedAmount: 1_000_000,
    allocatedAmount: 0,
    refundedAmount: 0,
    status: "open",
    createdAt: new Date("2026-10-20T00:00:00.000Z"),
    updatedAt: new Date("2026-10-20T00:00:00.000Z"),
    ...partial,
  }
}

function fp(
  partial: Partial<CustomerCreditQueueFpUmInput> & { downPaymentId: number },
): CustomerCreditQueueFpUmInput {
  return { ppnUangMuka: 110_000, hasActiveOutTaxInvoice: true, ...partial }
}

describe("buildCustomerCreditQueue — populasi + saldo (BR-CCQ-01/04)", () => {
  it("open saldo>0 tampil; saldo = received − allocated − refunded rumus kanonik", () => {
    const queue = buildCustomerCreditQueue(
      [credit({ creditId: 1, allocatedAmount: 250_000, refundedAmount: 50_000 })],
      [],
      { now: NOW },
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].saldo).toBe(700_000)
    expect(queue.summary.totalBaris).toBe(1)
    expect(queue.summary.totalSaldo).toBe(700_000)
  })

  it("V3: label rekap operasional, dilarang kata utang/aging/saldo buku", () => {
    expect(CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL).toBe(
      "total saldo kredit terbuka pada baris tampil",
    )
    expect(CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL).not.toMatch(/utang|aging|saldo buku/i)
  })

  it("umur dari createdAt (7 hari), updatedAt baru tidak mengnolkan umur (BR-CCQ-03)", () => {
    const queue = buildCustomerCreditQueue(
      [credit({ creditId: 1, updatedAt: NOW })],
      [],
      { now: NOW },
    )
    expect(queue.rows[0].umurHari).toBe(7)
  })
})

describe("buildCustomerCreditQueue — penanda FP UM (085-V Putusan 2, V1)", () => {
  it("V1: DP ber-FP UM aktif + ppnUangMuka>0 WAJIB berpenanda kata final", () => {
    const queue = buildCustomerCreditQueue(
      [credit({ creditId: 1 })],
      [fp({ downPaymentId: 10 })],
      { now: NOW },
    )
    expect(queue.rows[0].penandaFpUm).toBe(CUSTOMER_CREDIT_FP_UM_MARKER_TEXT)
    expect(CUSTOMER_CREDIT_FP_UM_MARKER_TEXT).toBe(
      "Refund menunggu pembatalan FP uang muka",
    )
    expect(queue.summary.jumlahBerpenandaFpUm).toBe(1)
  })

  it("FP UM dibatalkan (fakta aktif=false) → penanda hilang", () => {
    const queue = buildCustomerCreditQueue(
      [credit({ creditId: 1 })],
      [fp({ downPaymentId: 10, hasActiveOutTaxInvoice: false })],
      { now: NOW },
    )
    expect(queue.rows[0].penandaFpUm).toBeNull()
    expect(queue.summary.jumlahBerpenandaFpUm).toBe(0)
  })

  it("ppnUangMuka=0 atau snapshot legacy null → tanpa penanda walau FP aktif", () => {
    const zero = buildCustomerCreditQueue(
      [credit({ creditId: 1 })],
      [fp({ downPaymentId: 10, ppnUangMuka: 0 })],
      { now: NOW },
    )
    expect(zero.rows[0].penandaFpUm).toBeNull()
    const legacy = buildCustomerCreditQueue(
      [credit({ creditId: 1 })],
      [fp({ downPaymentId: 10, ppnUangMuka: null })],
      { now: NOW },
    )
    expect(legacy.rows[0].penandaFpUm).toBeNull()
  })

  it("sumber Quotation/RevisionDown tidak berpenanda tahap ini (perluasan 086-V kartu lain)", () => {
    const queue = buildCustomerCreditQueue(
      [
        credit({ creditId: 1, sourceType: "Quotation", sourceId: 10 }),
        credit({ creditId: 2, sourceType: "RevisionDown", sourceId: 10 }),
      ],
      [fp({ downPaymentId: 10 })],
      { now: NOW },
    )
    expect(queue.rows.map((r) => r.penandaFpUm)).toEqual([null, null])
  })

  it("fakta FP untuk DP lain tidak menandai baris ini", () => {
    const queue = buildCustomerCreditQueue(
      [credit({ creditId: 1, sourceId: 99 })],
      [fp({ downPaymentId: 10 })],
      { now: NOW },
    )
    expect(queue.rows[0].penandaFpUm).toBeNull()
  })

  it("V2: payload baris TIDAK memuat field mentah penentu penanda (UI tak bisa hitung sendiri)", () => {
    const queue = buildCustomerCreditQueue(
      [credit({ creditId: 1 })],
      [fp({ downPaymentId: 10 })],
      { now: NOW },
    )
    const rowJson = JSON.stringify(queue.rows[0])
    expect(rowJson).not.toContain("ppnUangMuka")
    expect(rowJson).not.toContain("hasActiveOutTaxInvoice")
    expect(rowJson).not.toContain("djpStatus")
    expect(rowJson).not.toContain("taxInvoice")
  })
})

describe("buildCustomerCreditQueue — ember anomali (EC-CCQ-2, V5)", () => {
  it("V5: used bersaldo>0 TIDAK masuk total tampil, terhitung anomali", () => {
    const queue = buildCustomerCreditQueue(
      [
        credit({ creditId: 1 }),
        credit({ creditId: 2, status: "used", receivedAmount: 500_000 }),
        credit({ creditId: 3, status: "refunded", receivedAmount: 300_000 }),
        credit({ creditId: 4, receivedAmount: 100_000, allocatedAmount: 100_000 }),
        credit({
          creditId: 5,
          receivedAmount: 100_000,
          allocatedAmount: 80_000,
          refundedAmount: 50_000,
        }),
      ],
      [],
      { now: NOW },
    )
    expect(queue.rows.map((r) => r.creditId)).toEqual([1])
    expect(queue.summary.totalSaldo).toBe(1_000_000)
    expect(queue.anomaly.tutupSaldoMasihPositif).toBe(2)
    expect(queue.anomaly.openSaldoNolAtauNegatif).toBe(2)
    expect(queue.anomaly.alokasiRefundMelebihiReceived).toBe(1)
  })
})
