import { describe, it, expect, vi } from "vitest"
import {
  applyOpenVendorCreditsToBill,
  vendorCreditBalance,
} from "@/lib/services/vendor-credit.service"

function mockTx(credits: Array<Record<string, unknown>>) {
  const creditUpdate = vi.fn().mockResolvedValue({})
  const billUpdate = vi.fn().mockResolvedValue({})
  const executeRawCalls: string[] = []
  const tx = {
    vendorCredit: {
      findMany: vi.fn().mockResolvedValue(credits),
      update: creditUpdate,
    },
    vendorBill: { update: billUpdate },
    $executeRaw: vi.fn((...a: any[]) => {
      const first = a[0]
      executeRawCalls.push(
        Array.isArray(first) ? first.join("?") : ((first as any)?.strings?.join("?") ?? String(first ?? "")),
      )
      return Promise.resolve(1)
    }),
  } as any
  return { tx, creditUpdate, billUpdate, executeRawCalls }
}

describe("vendorCreditBalance (lanjutan R8-JB-03)", () => {
  it("received − allocated", () => {
    expect(vendorCreditBalance({ receivedAmount: 200, allocatedAmount: 50 })).toBe(150)
    expect(vendorCreditBalance({ receivedAmount: 200, allocatedAmount: 200 })).toBe(0)
  })
})

describe("applyOpenVendorCreditsToBill", () => {
  it("kredit menutupi bill penuh: balanceDue 0, status paid, kredit used", async () => {
    const { tx, creditUpdate, billUpdate } = mockTx([
      { id: 1, receivedAmount: 500, allocatedAmount: 0 },
    ])
    const r = await applyOpenVendorCreditsToBill(tx, { vendorId: 9, billId: 77, balanceDue: 300 })
    expect(r.remainingBalanceDue).toBe(0)
    expect(r.appliedTotal).toBe(300)
    expect(creditUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ allocatedAmount: 300, status: "open" }),
      }),
    )
    expect(billUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 77 },
        data: expect.objectContaining({ balanceDue: 0, status: "paid" }),
      }),
    )
  })

  it("FIFO tertua dulu lintas kredit; sisa bill partial", async () => {
    const { tx, creditUpdate, billUpdate } = mockTx([
      { id: 1, receivedAmount: 100, allocatedAmount: 40 },
      { id: 2, receivedAmount: 500, allocatedAmount: 0 },
    ])
    const r = await applyOpenVendorCreditsToBill(tx, { vendorId: 9, billId: 78, balanceDue: 400 })
    // Kredit 1 saldo 60 habis → used; kredit 2 ambil 340 → tetap open.
    expect(r.remainingBalanceDue).toBe(0)
    expect(creditUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ allocatedAmount: 100, status: "used" }),
      }),
    )
    expect(creditUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({ allocatedAmount: 340, status: "open" }),
      }),
    )
    expect(billUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ balanceDue: 0, status: "paid" }) }),
    )
  })

  it("kredit lebih kecil dari bill: bill tetap partial dengan sisa", async () => {
    const { tx, billUpdate } = mockTx([{ id: 1, receivedAmount: 100, allocatedAmount: 0 }])
    const r = await applyOpenVendorCreditsToBill(tx, { vendorId: 9, billId: 79, balanceDue: 1000 })
    expect(r.remainingBalanceDue).toBe(900)
    expect(billUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 79 },
        data: expect.objectContaining({ balanceDue: 900, status: "partial" }),
      }),
    )
  })

  it("tanpa kredit open: bill tak disentuh", async () => {
    const { tx, billUpdate, creditUpdate } = mockTx([])
    const r = await applyOpenVendorCreditsToBill(tx, { vendorId: 9, billId: 80, balanceDue: 1000 })
    expect(r).toEqual({ remainingBalanceDue: 1000, appliedTotal: 0 })
    expect(billUpdate).not.toHaveBeenCalled()
    expect(creditUpdate).not.toHaveBeenCalled()
  })

  it("kredit vendor dikunci FOR UPDATE sebelum dibaca (anti pakai-ganda dua confirm)", async () => {
    const { tx, executeRawCalls } = mockTx([
      { id: 1, receivedAmount: 500, allocatedAmount: 0 },
    ])
    const r = await applyOpenVendorCreditsToBill(tx, { vendorId: 9, billId: 82, balanceDue: 300 })
    expect(r.appliedTotal).toBe(300)
    // Tanpa kunci, dua confirm bill vendor sama sama-sama membaca
    // allocatedAmount basi dan kredit Rp100 mengurangi dua bill.
    const lockIdx = executeRawCalls.findIndex(
      (s) => /vendor_credits/i.test(s) && /for update/i.test(s),
    )
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    expect(tx.$executeRaw.mock.invocationCallOrder[lockIdx]).toBeLessThan(
      tx.vendorCredit.findMany.mock.invocationCallOrder[0],
    )
  })

  it("bill sudah dalam toleransi Rp1: kredit tidak dikonsumsi", async () => {
    const { tx, creditUpdate } = mockTx([{ id: 1, receivedAmount: 100, allocatedAmount: 0 }])
    const r = await applyOpenVendorCreditsToBill(tx, { vendorId: 9, billId: 81, balanceDue: 1 })
    expect(r.appliedTotal).toBe(0)
    expect(creditUpdate).not.toHaveBeenCalled()
  })
})
