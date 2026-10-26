import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * P0-1/P0-2 (review fix plan): DP confirmation tidak boleh kehilangan alokasi
 * dan tidak boleh mem-bypass posting resmi.
 *
 * - Invoice lahir mengalokasi SEMUA verified DP (bukan cuma DP pemicu).
 * - DP lanjutan idempoten via marker notes per nomor DP (retry aman).
 * - DP confirmation hanya sentuh paymentStatus — status lifecycle (draft /
 *   posted) milik postInvoice + gate izin/approval/period-lock.
 * - Retry DP confirmed TIDAK memanggil onSalesInvoicePosted.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  downPaymentFindMany: vi.fn(),
  downPaymentUpdate: vi.fn(),
  salesInvoiceFindFirst: vi.fn(),
  salesInvoiceCreate: vi.fn(),
  salesInvoiceUpdate: vi.fn(),
  salesPaymentCreate: vi.fn(),
  salesPaymentFindFirst: vi.fn(),
  salesPaymentFindMany: vi.fn(),
  systemSettingFindFirst: vi.fn(),
  journalFindFirst: vi.fn(),
  journalCreate: vi.fn(),
  accountFindMany: vi.fn(),
  assertPeriodOpen: vi.fn(),
  generateDocumentNumber: vi.fn(),
  notifyDocumentsReadyBatch: vi.fn(),
  onSalesInvoicePosted: vi.fn(),
}))

vi.mock("@/lib/db/prisma", async () => (await import("./down-payment-fixtures")).dpPrismaFactory(mocks))
vi.mock("@/lib/utils/document-number", async () => (await import("./down-payment-fixtures")).dpDocNumberFactory(mocks))

vi.mock("@/lib/services/period-lock.service", async () => (await import("./down-payment-fixtures")).dpPeriodLockFactory(mocks))

vi.mock("@/lib/services/notification.service", async () => (await import("./down-payment-fixtures")).dpNotificationFactory(mocks))
vi.mock("@/lib/hooks/accounting.hook", async () => (await import("./down-payment-fixtures")).dpAccountingFactory(mocks))

import { onDownPaymentConfirmed } from "../down-payment.hook"

import { buildDp, buildDpTx, mockConfirmedDps, confirmedDpRow, expectInvoicePaid, expectInvoiceNotPaid, expectPaymentNotes, expectPaymentData, expectCreditCreated } from "./down-payment-fixtures"

function buildTx(dp: ReturnType<typeof buildDp>) {
  return buildDpTx(mocks, dp)
}

describe("review P0-1/P0-2 — alokasi DP penuh + tanpa bypass posting", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateDocumentNumber.mockImplementation((prefix: string) => Promise.resolve(`${prefix}-1`))
    mocks.notifyDocumentsReadyBatch.mockResolvedValue(undefined)
    mocks.onSalesInvoicePosted.mockResolvedValue(undefined)
    mocks.downPaymentUpdate.mockResolvedValue({})
    mocks.systemSettingFindFirst.mockResolvedValue({ customerDownPaymentAccountId: 210, salesReceivableAccountId: 110 })
    mocks.journalFindFirst.mockResolvedValue(null)
    mocks.journalCreate.mockResolvedValue({ id: 9 })
    mocks.accountFindMany.mockImplementation(async (args: any) => (args?.where?.id?.in ?? []).map((id: number) => ({ id })))
    mocks.assertPeriodOpen.mockResolvedValue(undefined)
    mocks.salesPaymentCreate.mockResolvedValue({ id: 555 })
    mocks.salesPaymentFindFirst.mockResolvedValue(null)
    mocks.salesPaymentFindMany.mockResolvedValue([])
    mocks.salesInvoiceCreate.mockResolvedValue({ id: 101, documentNo: "INV-1" })
    mocks.salesInvoiceUpdate.mockResolvedValue({})
    // Jalur lahir invoice: belum ada invoice.
    mocks.salesInvoiceFindFirst.mockResolvedValue(null)
  })

  it("DP2 200 memicu ambang (DP1 300 sudah confirmed): invoice alokasi KEDUA DP = 500", async () => {
    const dp = buildDp({ id: 2, amount: 200, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp)
    // Kumulatif verified = DP1 300 + DP2 200 = 500 = tepat 50%.
    mockConfirmedDps(mocks, [
      confirmedDpRow("DP-1", 300, "2026-09-01T00:00:00Z"),
      confirmedDpRow("DP-2", 200, "2026-10-01T00:00:00Z"),
    ])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    // Dua SalesPayment: satu per verified DP.
    expect(mocks.salesPaymentCreate).toHaveBeenCalledTimes(2)
    expectPaymentNotes(mocks, "DP-1")
    expectPaymentNotes(mocks, "DP-2")
    // paidAmount invoice = 500 (semua verified DP), bukan 200.
    expectInvoicePaid(mocks, { paidAmount: 500 })
    // Invoice lahir draft + posting TIDAK dipanggil.
    expect(mocks.salesInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "draft" }) }),
    )
    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
  })

  it("kelebihan DP jadi kredit pelanggan + paidAmount dibatasi grandTotal (AUD-FIN-02)", async () => {
    // DP1 600 + DP2 600 = 1200 > grandTotal 1000 → selisih 200 = kredit.
    const dp = buildDp({ id: 2, amount: 600, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp)
    mockConfirmedDps(mocks, [
      confirmedDpRow("DP-1", 600, "2026-09-01T00:00:00Z"),
      confirmedDpRow("DP-2", 600, "2026-10-01T00:00:00Z"),
    ])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    // Kredit terbentuk: sumber Quotation 10, selisih 200.
    expectCreditCreated(tx, { customerId: 99, sourceType: "Quotation", sourceId: 10, receivedAmount: 200 })
    // paidAmount DIBATASI 1000 (grandTotal) — bukan 1200. Tanpa cap, AR
    // overstate + double-count (sekali di paidAmount, sekali di kredit).
    expectInvoicePaid(mocks, { paidAmount: 1000, paymentStatus: "paid" })
    expectInvoiceNotPaid(mocks, { paidAmount: 1200 })
  })

  it("BLOCKER-1 F-036-S: konversi DP lahir lunas -> snapshot tarif beku 2% per tanggal faktur", async () => {
    const dp = buildDp({ id: 2, amount: 600, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp)
    mockConfirmedDps(mocks, [
      confirmedDpRow("DP-1", 600, "2026-09-01T00:00:00Z"),
      confirmedDpRow("DP-2", 600, "2026-10-01T00:00:00Z"),
    ])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    expect(mocks.salesInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: "paid",
          commissionCustomerCategoryId: 1,
          commissionRateId: 1,
        }),
      }),
    )
    const finalData = mocks.salesInvoiceUpdate.mock.calls
      .map((c: any) => c[0].data)
      .find((d: any) => d.paymentStatus === "paid")
    expect(Number(finalData.commissionRatePercent)).toBe(2)
  })

  it("BLOCKER-1 F-036-S: DP lanjutan melunasi -> snapshot tarif beku; existing tidak ditimpa", async () => {
    const dp = buildDp({ id: 9, amount: 5000, status: "draft", docNo: "DP-9" })
    const tx = buildTx(dp)
    mocks.salesInvoiceFindFirst.mockResolvedValue({
      id: 101, documentNo: "INV-1", grandTotal: 10000, paidAmount: 8000,
      paymentStatus: "partial",
      date: new Date(Date.UTC(2026, 9, 1)), commissionRatePercent: null,
    })
    mocks.salesPaymentFindFirst.mockResolvedValue(null)
    mocks.salesPaymentFindMany
      .mockResolvedValueOnce([{ amount: 8000 }])
      .mockResolvedValue([{ amount: 8000 }, { amount: 2000 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(9, 1)

    expect(mocks.salesInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: "paid",
          commissionCustomerCategoryId: 1,
          commissionRateId: 1,
        }),
      }),
    )
    const data = mocks.salesInvoiceUpdate.mock.calls[0][0].data
    expect(Number(data.commissionRatePercent)).toBe(2)
  })

  it("BLOCKER-1 F-036-S: DP lanjutan dengan snapshot existing -> tidak ditulis ulang", async () => {
    const dp = buildDp({ id: 9, amount: 5000, status: "draft", docNo: "DP-9" })
    const tx = buildTx(dp)
    mocks.salesInvoiceFindFirst.mockResolvedValue({
      id: 101, documentNo: "INV-1", grandTotal: 10000, paidAmount: 8000,
      paymentStatus: "partial",
      date: new Date(Date.UTC(2026, 9, 1)), commissionRatePercent: 7,
    })
    mocks.salesPaymentFindFirst.mockResolvedValue(null)
    mocks.salesPaymentFindMany
      .mockResolvedValueOnce([{ amount: 8000 }])
      .mockResolvedValue([{ amount: 8000 }, { amount: 2000 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(9, 1)

    const data = mocks.salesInvoiceUpdate.mock.calls[0][0].data
    expect(data.paymentStatus).toBe("paid")
    expect(data.commissionRatePercent).toBeUndefined()
    expect(data.commissionRateId).toBeUndefined()
  })

  it("DP pas (tanpa kelebihan): kredit TIDAK terbentuk", async () => {
    const dp = buildDp({ id: 2, amount: 200, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp)
    mockConfirmedDps(mocks, [
      confirmedDpRow("DP-1", 300, "2026-09-01T00:00:00Z"),
      confirmedDpRow("DP-2", 200, "2026-10-01T00:00:00Z"),
    ])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    expect(tx.customerCredit.create).not.toHaveBeenCalled()
  })

  it("DP lanjutan melebihi sisa faktur: cap paidAmount + selisih jadi kredit (AUD-NEXT-03)", async () => {
    // Faktur 10000, terbayar 8000 (sisa 2000), DP lanjutan 5000 → alokasi
    // 2000, kredit 3000. Tanpa cap: paidAmount 13000 = AR overstate.
    const dp = buildDp({ id: 9, amount: 5000, status: "draft", docNo: "DP-9" })
    const tx = buildTx(dp)
    mocks.salesInvoiceFindFirst.mockResolvedValue({
      id: 101, documentNo: "INV-1", grandTotal: 10000, paidAmount: 8000,
      paymentStatus: "partial",
      date: new Date(Date.UTC(2026, 9, 1)), commissionRatePercent: null,
    })
    mocks.salesPaymentFindFirst.mockResolvedValue(null)
    // R3-04: payment pertama = prePaid (8000, sebelum alokasi); kedua =
    // sesudah alokasi 2000 → total 10000. Payment tak lagi DP penuh 5000.
    mocks.salesPaymentFindMany
      .mockResolvedValueOnce([{ amount: 8000 }])
      .mockResolvedValue([{ amount: 8000 }, { amount: 2000 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(9, 1)

    // paidAmount DIBATASI 10000 — bukan 13000.
    expectInvoicePaid(mocks, { paidAmount: 10000, paymentStatus: "paid" })
    expectInvoiceNotPaid(mocks, { paidAmount: 13000 })
    // R3-04: SalesPayment = ALOKASI 2000 (bukan DP penuh 5000) — laporan
    // yang menjumlah payment tak lagi double-count dengan kredit 3000.
    expectPaymentData(mocks, { amount: 2000 })
    expect(mocks.salesPaymentCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 5000 }) }),
    )
    // Selisih 3000 jadi kredit sumber DownPayment DP-9.
    expectCreditCreated(tx, { sourceType: "DownPayment", sourceId: 9, receivedAmount: 3000 })
  })

  it("retry DP lanjutan yang sudah teralokasi: tidak buat SalesPayment kedua", async () => {
    const dp = buildDp({ id: 2, amount: 200, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp)
    // Invoice SUDAH ada (dari confirm pertama) + marker DP-2 sudah teralokasi.
    mocks.salesInvoiceFindFirst.mockResolvedValue({ id: 101, grandTotal: 1000, paymentStatus: "partial", date: new Date(Date.UTC(2026, 9, 1)), commissionRatePercent: null })
    mocks.salesPaymentFindFirst.mockResolvedValue({ id: 555 })
    mocks.salesPaymentFindMany.mockResolvedValue([{ amount: 500 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    expect(mocks.salesPaymentCreate).not.toHaveBeenCalled()
  })

  it("DP lanjutan tidak mengubah status lifecycle invoice (tetap draft)", async () => {
    const dp = buildDp({ id: 3, amount: 100, status: "draft", docNo: "DP-3" })
    const tx = buildTx(dp)
    mocks.salesInvoiceFindFirst.mockResolvedValue({ id: 101, grandTotal: 1000, paymentStatus: "partial", date: new Date(Date.UTC(2026, 9, 1)), commissionRatePercent: null })
    mocks.salesPaymentFindFirst.mockResolvedValue(null)
    mocks.salesPaymentFindMany.mockResolvedValue([{ amount: 500 }, { amount: 100 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(3, 1)

    // Update hanya paidAmount + paymentStatus — TIDAK ada kunci `status`.
    expect(mocks.salesInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: expect.anything() }),
      }),
    )
    expect(mocks.salesInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "partial" }) }),
    )
    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
  })

  it("retry DP confirmed: return tanpa posting", async () => {
    const dp = buildDp({ id: 2, amount: 200, status: "confirmed", docNo: "DP-2" })
    const tx = buildTx(dp)
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
    expect(mocks.salesPaymentCreate).not.toHaveBeenCalled()
  })
})
