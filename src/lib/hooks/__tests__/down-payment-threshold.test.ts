import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * P0-1 + F-2026-10-22-065-S: invoice konversi DP lahir SEKALI sebagai
 * DRAFT, hanya bila total DP terverifikasi (CONFIRMED) mencapai ambang
 * persen snapshot quotation (default fail-closed 50%).
 * DP di bawah ambang: WO/SO/Project dibuat (kerja boleh mulai) tapi TANPA
 * invoice, TANPA posting, TANPA stock-out.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  downPaymentFindMany: vi.fn(),
  downPaymentUpdate: vi.fn(),
  workOrderFindFirst: vi.fn(),
  salesOrderFindFirst: vi.fn(),
  workOrderCreate: vi.fn(),
  salesOrderCreate: vi.fn(),
  salesInvoiceCreate: vi.fn(),
  salesInvoiceFindFirst: vi.fn(),
  salesPaymentCreate: vi.fn(),
  generateDocumentNumber: vi.fn(),
  notifyDocumentsReadyBatch: vi.fn(),
  onSalesInvoicePosted: vi.fn(),
}))

vi.mock("@/lib/db/prisma", async () => (await import("./down-payment-fixtures")).dpPrismaFactory(mocks))
vi.mock("@/lib/utils/document-number", async () => (await import("./down-payment-fixtures")).dpDocNumberFactory(mocks))

vi.mock("@/lib/services/notification.service", async () => (await import("./down-payment-fixtures")).dpNotificationFactory(mocks))
vi.mock("@/lib/hooks/accounting.hook", async () => (await import("./down-payment-fixtures")).dpAccountingFactory(mocks))

import { onDownPaymentConfirmed } from "../down-payment.hook"

import { buildDp, buildDpTx, existingInvoice, wireInvoice, expectPaymentData, expectDpConfirmed } from "./down-payment-fixtures"

function buildTx(dp: ReturnType<typeof buildDp>) {
  return buildDpTx(mocks, dp, {
    // tx period-lock baca tx.$queryRaw rows; default tidak terkunci.
    $queryRaw: mocks.queryRaw,
    workOrder: { findFirst: mocks.workOrderFindFirst, create: mocks.workOrderCreate },
    salesOrder: { findFirst: mocks.salesOrderFindFirst, create: mocks.salesOrderCreate },
    salesInvoice: {
      findFirst: mocks.salesInvoiceFindFirst,
      create: mocks.salesInvoiceCreate,
      update: vi.fn(),
    },
    salesPayment: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), create: mocks.salesPaymentCreate },
    systemSetting: { findFirst: vi.fn().mockResolvedValue({ customerDownPaymentAccountId: 210102, salesReceivableAccountId: 110 }) },
    journal: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 77 }) },
  })
}

describe("ambang snapshot konversi DP ke invoice (F-2026-10-22-065-S)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateDocumentNumber.mockImplementation((prefix: string) => Promise.resolve(`${prefix}-1`))
    mocks.notifyDocumentsReadyBatch.mockResolvedValue(undefined)
    mocks.onSalesInvoicePosted.mockResolvedValue(undefined)
    mocks.downPaymentUpdate.mockResolvedValue({})
    mocks.salesPaymentCreate.mockResolvedValue({ id: 555 })
    mocks.workOrderCreate.mockResolvedValue({ id: 11, documentNo: "WO-1" })
    mocks.salesOrderCreate.mockResolvedValue({ id: 12, documentNo: "SO-1" })
    mocks.salesInvoiceCreate.mockResolvedValue({ id: 101, documentNo: "INV-1" })
    // Jalur pembuatan: belum ada WO/SO/invoice.
    mocks.workOrderFindFirst.mockResolvedValue(null)
    mocks.salesOrderFindFirst.mockResolvedValue(null)
    mocks.salesInvoiceFindFirst.mockResolvedValue(null)
    mocks.queryRaw.mockResolvedValue([{ id: 1, period_lock_date: null }])
  })

  it("DP 300 dari 1000 (30%): WO/SO dibuat, invoice TIDAK dibuat, posting TIDAK dipanggil", async () => {
    const dp = buildDp({ id: 1, amount: 300, status: "draft", docNo: "DP-1" })
    const tx = buildTx(dp)
    // Kumulatif terverifikasi setelah DP ini CONFIRMED = 300 < 500.
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 300 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(1, 1)

    expect(mocks.workOrderCreate).toHaveBeenCalled()
    expect(mocks.salesOrderCreate).toHaveBeenCalled()
    expect(mocks.salesInvoiceCreate).not.toHaveBeenCalled()
    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
    expectDpConfirmed(mocks, 1)
  })

  it("DP kedua genap 50% (200+300 dari 1000): invoice DRAFT dibuat sekali", async () => {
    const dp = buildDp({ id: 2, amount: 200, status: "draft", docNo: "DP-2" })
    const tx = buildTx(dp)
    // WO/SO sudah ada dari DP pertama; kumulatif = 500 = tepat 50%.
    mocks.workOrderFindFirst.mockResolvedValue({ id: 11 })
    mocks.salesOrderFindFirst.mockResolvedValue({ id: 12 })
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 300 }, { amount: 200 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(2, 1)

    expect(mocks.workOrderCreate).not.toHaveBeenCalled()
    expect(mocks.salesOrderCreate).not.toHaveBeenCalled()
    expect(mocks.salesInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "draft" }) })
    )
    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
  })

  it("DP draft/batal tidak dihitung dalam kumulatif", async () => {
    const dp = buildDp({ id: 3, amount: 400, status: "draft", docNo: "DP-3" })
    const tx = buildTx(dp)
    // findMany hanya kembalikan CONFIRMED — draft 400 + confirmed 100 = 100.
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 100 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(3, 1)

    // findMany WAJIB menyaring status CONFIRMED.
    expect(mocks.downPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "confirmed" }) })
    )
    expect(mocks.salesInvoiceCreate).not.toHaveBeenCalled()
  })

  it("DP lanjutan ke invoice existing: SalesPayment + jurnal Dr 210102 / Cr Piutang (AUD-FIN-04)", async () => {
    const dp = buildDp({ id: 9, amount: 300, status: "draft", docNo: "DP-9" })
    const tx = buildTx(dp)
    wireInvoice(tx, existingInvoice())
    ;(tx.salesPayment as any).findMany = vi.fn()
      .mockResolvedValueOnce([{ amount: 600, withholdingAmount: 0 }])
      .mockResolvedValueOnce([{ amount: 600, withholdingAmount: 0 }, { amount: 300, withholdingAmount: 0 }])
    const invoiceUpdate = vi.fn()
    ;(tx.salesInvoice as any).update = invoiceUpdate
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(9, 1)

    // allocSen = min(300, 1000-600) = 300 → payment alokasi 300.
    expectPaymentData(mocks, { amount: 300, paymentMethod: "down_payment" })
    // Jurnal reklas dalam tx sama: Dr 210102 / Cr Piutang 110, TANPA kas.
    expect((tx.journal.create as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceType: "SalesPayment",
          referenceId: 555,
          totalDebit: 300,
          totalCredit: 300,
          entries: {
            create: [
              expect.objectContaining({ accountId: 210102, debit: 300, credit: 0 }),
              expect.objectContaining({ accountId: 110, debit: 0, credit: 300 }),
            ],
          },
        }),
      }),
    )
    // paidAmount = 900 → partial.
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paidAmount: 900, paymentStatus: "partial" }) }),
    )
  })

  it("DP lanjutan retry (payment sudah ada): payment + jurnal TIDAK ganda", async () => {
    const dp = buildDp({ id: 9, amount: 300, status: "draft", docNo: "DP-9" })
    const tx = buildTx(dp)
    wireInvoice(tx, existingInvoice(), { id: 555 })
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(9, 1)

    expect(mocks.salesPaymentCreate).not.toHaveBeenCalled()
    expect((tx.journal.create as any)).not.toHaveBeenCalled()
  })

  it("SalesPayment memakai tanggal bayar DP aktual, bukan hari ini", async () => {
    const payDate = new Date("2026-09-15T00:00:00Z")
    const dp = buildDp({ id: 4, amount: 600, status: "draft", docNo: "DP-4", paymentDate: payDate })
    const tx = buildTx(dp)
    // findMany CONFIRMED kembalikan DP-4 sendiri (lengkap documentNo+paymentDate).
    mocks.downPaymentFindMany.mockResolvedValue([{ documentNo: "DP-4", amount: 600, paymentDate: payDate }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(4, 1)

    expectPaymentData(mocks, { paymentDate: payDate })
  })

  it("snapshot 30%: invoice lahir pada kumulatif 30%, bukan 50% (AC-DP65-1/3)", async () => {
    const dp = buildDp({ id: 5, amount: 300, status: "draft", docNo: "DP-5", invoiceThresholdPercent: 30 })
    const tx = buildTx(dp)
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 300 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(5, 1)

    expect(mocks.salesInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "draft" }) })
    )
    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
  })

  it("snapshot 30%: kumulatif 29% belum melahirkan invoice (AC-DP65-3)", async () => {
    const dp = buildDp({ id: 6, amount: 290, status: "draft", docNo: "DP-6", invoiceThresholdPercent: 30 })
    const tx = buildTx(dp)
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 290 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(6, 1)

    expect(mocks.salesInvoiceCreate).not.toHaveBeenCalled()
  })

  it("snapshot 100%: invoice hanya saat lunas penuh (AC-DP65-3)", async () => {
    const dp = buildDp({ id: 7, amount: 999, status: "draft", docNo: "DP-7", invoiceThresholdPercent: 100 })
    const tx = buildTx(dp)
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 999 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(7, 1)

    expect(mocks.salesInvoiceCreate).not.toHaveBeenCalled()
  })

  it("TASK-011 BUG-01: SO sudah ada tanpa WO (convert manual) — WO saja yang dibuat, confirm tidak melempar", async () => {
    const dp = buildDp({ id: 11, amount: 600, status: "draft", docNo: "DP-11" })
    const tx = buildTx(dp)
    mocks.workOrderFindFirst.mockResolvedValue(null)
    mocks.salesOrderFindFirst.mockResolvedValue({ id: 12, documentNo: "SO-0" })
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 600 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await expect(onDownPaymentConfirmed(11, 1)).resolves.toBeUndefined()

    expect(mocks.workOrderCreate).toHaveBeenCalledTimes(1)
    expect(mocks.salesOrderCreate).not.toHaveBeenCalled()
    expect(mocks.salesInvoiceCreate).toHaveBeenCalled()
  })

  it("TASK-011 BUG-01: WO sudah ada tanpa SO — SO saja yang dibuat, confirm tidak melempar", async () => {
    const dp = buildDp({ id: 12, amount: 600, status: "draft", docNo: "DP-12" })
    const tx = buildTx(dp)
    mocks.workOrderFindFirst.mockResolvedValue({ id: 11, documentNo: "WO-0" })
    mocks.salesOrderFindFirst.mockResolvedValue(null)
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 600 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await expect(onDownPaymentConfirmed(12, 1)).resolves.toBeUndefined()

    expect(mocks.workOrderCreate).not.toHaveBeenCalled()
    expect(mocks.salesOrderCreate).toHaveBeenCalledTimes(1)
  })

  it("TASK-011 BUG-02: alokasi DP awal membuat jurnal reklas Dr 210102 / Cr Piutang", async () => {
    const dp = buildDp({ id: 13, amount: 600, status: "draft", docNo: "DP-13" })
    const tx = buildTx(dp)
    mocks.downPaymentFindMany.mockResolvedValue([
      { documentNo: "DP-13", amount: 600, paymentDate: new Date("2026-10-01T00:00:00Z") },
    ])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(13, 1)

    expect((tx.journal.create as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceType: "SalesPayment",
          referenceId: 555,
          totalDebit: 600,
          totalCredit: 600,
          entries: {
            create: [
              expect.objectContaining({ accountId: 210102, debit: 600, credit: 0 }),
              expect.objectContaining({ accountId: 110, debit: 0, credit: 600 }),
            ],
          },
        }),
      }),
    )
  })

  it("snapshot korup 150: fail-closed ke 50 + log, invoice tidak lahir pada 30% (AC-DP65-5)", async () => {
    const dp = buildDp({ id: 8, amount: 300, status: "draft", docNo: "DP-8", invoiceThresholdPercent: 150 })
    const tx = buildTx(dp)
    mocks.downPaymentFindMany.mockResolvedValue([{ amount: 300 }])
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await onDownPaymentConfirmed(8, 1)

    expect(mocks.salesInvoiceCreate).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("fail-closed 50%"))
    errorSpy.mockRestore()
  })
})
