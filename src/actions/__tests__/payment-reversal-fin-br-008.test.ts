import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * FIN-BR-008 (vonis t_9a1c4453): falsifikasi reversal pembayaran berhistori.
 * Memakai modul NYATA reverseJournalsByReferenceTx + helper saldo vendor
 * in-state supaya penjaga perilaku (bukan mock penjaga) yang diuji:
 * mutasi penjaga (reversal->delete jurnal / lepas pengembalian saldo /
 * recalc ikut reversed) wajib memerahkan tes ini.
 */

const mocks = vi.hoisted(() => {
  // Prisma model tiruan dipadatkan: nilai-bawaan dipisah ke tabel supaya 13
  // metode tidak ditulis sebagai 13 baris berulang (duplikasi Sonar pada
  // berkas uji aksi). Semantik sama dengan buildModelMock lama.
  const DEFAULTS: Record<string, () => unknown> = {
    findMany: () => [],
    create: () => ({ id: 1 }),
    createMany: () => ({ count: 1 }),
    update: () => ({}),
    updateMany: () => ({ count: 1 }),
    delete: () => ({}),
    deleteMany: () => ({ count: 1 }),
    count: () => 0,
    upsert: () => ({}),
    aggregate: () => ({ _sum: {} }),
  }
  const buildModelMock = () =>
    Object.fromEntries(
      ["findFirst", "findUnique", "findUniqueOrThrow", "findMany", "create", "createMany", "update", "updateMany", "delete", "deleteMany", "count", "upsert", "aggregate"].map((m) => [
        m,
        vi.fn().mockResolvedValue(DEFAULTS[m] ? DEFAULTS[m]() : null),
      ]),
    )

  const prismaMock: any = {
    vendorPayment: buildModelMock(),
    vendorPaymentAllocation: buildModelMock(),
    vendorBill: buildModelMock(),
    salesPayment: buildModelMock(),
    salesInvoice: buildModelMock(),
    journal: buildModelMock(),
    journalEntry: buildModelMock(),
    withholdingCertificate: buildModelMock(),
    financialIdempotencyKey: buildModelMock(),
    transactionAttachment: buildModelMock(),
    systemSetting: buildModelMock(),
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    assertPeriodOpenMock: vi.fn().mockResolvedValue(undefined),
    generateJournalNumberMock: vi.fn().mockResolvedValue("JRN-RV-TEST"),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: any) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivityMock,
  reportPostCommitAuditFailure: vi.fn(),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: any) => mocks.assertPeriodOpenMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("DOC-001"),
  generateJournalNumber: mocks.generateJournalNumberMock,
  generateDocumentNumberBatch: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/services/inventory-fifo", () => ({
  consumeFifoLayers: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/services/journal.service", () => ({
  REVERSAL_JOURNAL_REVERSAL_ERROR: "Jurnal reversal tidak dapat dibalik",
}))
vi.mock("@/lib/services/notification.service", () => ({
  notificationService: { notifyAdmins: vi.fn().mockResolvedValue({}) },
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn().mockResolvedValue({}),
  assertApproved: vi.fn().mockResolvedValue({}),
}))

import * as purchaseActions from "../purchase.actions"
import * as salesActions from "../sales.actions"
import { onSalesPaymentDeleted } from "@/lib/hooks/sales-payment.hook"

const REASON = "Salah rekening tujuan"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
  mocks.assertPeriodOpenMock.mockResolvedValue(undefined)
  mocks.prismaMock.journal.findFirst.mockResolvedValue(null)
  mocks.prismaMock.withholdingCertificate.findFirst.mockResolvedValue(null)
  mocks.prismaMock.salesInvoice.update.mockResolvedValue({})
})

describe("FIN-BR-008 reverseVendorPayment", () => {
  function arrangeCompleted() {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "completed", amount: 600, vendorId: 9,
    })
    mocks.prismaMock.vendorPaymentAllocation.findMany.mockResolvedValue([
      { id: 11, vendorPaymentId: 1, vendorBillId: 21, amount: 400 },
      { id: 12, vendorPaymentId: 1, vendorBillId: 22, amount: 200 },
    ])
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([
      { id: 21, grandTotal: 1000, withholdingAmount: 0, paidAmount: 400 },
      { id: 22, grandTotal: 200, withholdingAmount: 0, paidAmount: 200 },
    ])
    // Jurnal asal POSTED; belum ada jurnal lawan (findFirst reversal = null).
    mocks.prismaMock.journal.findMany.mockResolvedValue([
      {
        id: 51, status: "POSTED", transactionDate: new Date("2026-10-01"),
        journalNumber: "JRN-51", type: "payment",
        totalDebit: 600, totalCredit: 600,
        entries: [
          { accountId: 201, debit: 600, credit: 0, memo: "AP", costCenterId: null, profitCenterId: null },
          { accountId: 101, debit: 0, credit: 600, memo: "Kas", costCenterId: null, profitCenterId: null },
        ],
      },
    ])
    mocks.prismaMock.journal.create.mockResolvedValue({ id: 99 })
  }

  it("alasan kosong ditolak sebelum mutasi apa pun", async () => {
    const res = await purchaseActions.reverseVendorPayment(1, "   ")
    expect(res.success).toBe(false)
    expect(res.error).toContain("Alasan pembalikan")
    expect(mocks.prismaMock.vendorPayment.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.journal.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
  })

  it("completed: jurnal lawan POSTED seimbang, asal REVERSED, saldo bill kembali persis, alokasi terhapus, payment reversed beralasan", async () => {
    arrangeCompleted()
    const res = await purchaseActions.reverseVendorPayment(1, REASON)
    expect(res.success).toBe(true)

    // Jurnal lawan: debit/kredit tertukar, total sama (subledger vs GL = 0).
    const reversalCreate = mocks.prismaMock.journal.create.mock.calls[0][0]
    expect(reversalCreate.data.status).toBe("POSTED")
    expect(reversalCreate.data.referenceType).toBe("Journal")
    expect(reversalCreate.data.referenceId).toBe(51)
    expect(reversalCreate.data.totalDebit).toBe(reversalCreate.data.totalCredit)
    const entries = mocks.prismaMock.journalEntry.createMany.mock.calls[0][0].data
    expect(entries[0].debit).toBe(0)
    expect(entries[0].credit).toBe(600)
    expect(mocks.prismaMock.journal.update).toHaveBeenCalledWith({
      where: { id: 51 }, data: { status: "REVERSED" },
    })
    // Jurnal asal TIDAK dihapus fisik.
    expect(mocks.prismaMock.journal.delete).not.toHaveBeenCalled()
    expect(mocks.prismaMock.journal.deleteMany).not.toHaveBeenCalled()

    // Saldo kembali persis per alokasi.
    const billUpdates = mocks.prismaMock.vendorBill.update.mock.calls.map((c: any) => c[0])
    const bill21 = billUpdates.find((c: any) => c.where.id === 21)
    const bill22 = billUpdates.find((c: any) => c.where.id === 22)
    expect(Number(bill21.data.paidAmount)).toBe(0)
    expect(Number(bill21.data.balanceDue)).toBe(1000)
    expect(bill21.data.status).toBe("posted")
    expect(Number(bill22.data.paidAmount)).toBe(0)
    expect(Number(bill22.data.balanceDue)).toBe(200)
    expect(bill22.data.status).toBe("posted")
    expect(mocks.prismaMock.vendorPaymentAllocation.deleteMany).toHaveBeenCalledWith({
      where: { vendorPaymentId: 1 },
    })

    // Dokumen asal tetap ada, status reversed + histori alasan.
    const payUpdate = mocks.prismaMock.vendorPayment.update.mock.calls[0][0]
    expect(payUpdate.data.status).toBe("reversed")
    expect(payUpdate.data.reversalReason).toBe(REASON)
    expect(payUpdate.data.reversedBy).toBe(7)
    expect(payUpdate.data.reversedAt).toBeInstanceOf(Date)
    expect(mocks.prismaMock.vendorPayment.delete).not.toHaveBeenCalled()
    expect(mocks.logActivityMock).toHaveBeenCalledWith(
      "reverse", "VendorPayment", 1, expect.stringContaining(REASON),
    )
  })

  it("periode jurnal asal terkunci: ditolak, nol mutasi saldo/dokumen", async () => {
    arrangeCompleted()
    mocks.assertPeriodOpenMock.mockRejectedValue(new Error("Periode sudah dikunci"))
    const res = await purchaseActions.reverseVendorPayment(1, REASON)
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorPayment.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorPaymentAllocation.deleteMany).not.toHaveBeenCalled()
  })

  it("reversal kedua ditolak (sudah reversed), GL tidak berubah", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "reversed", amount: 600, vendorId: 9,
    })
    const res = await purchaseActions.reverseVendorPayment(1, REASON)
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah dibalik")
    expect(mocks.prismaMock.journal.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
  })

  it("draft tidak bisa di-reverse (hapus saja), nol mutasi", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", amount: 100, vendorId: 9,
    })
    const res = await purchaseActions.reverseVendorPayment(1, REASON)
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.journal.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorPayment.update).not.toHaveBeenCalled()
  })

  it("idempotency replay: key sama mengembalikan reversal awal tanpa jurnal/saldo baru", async () => {
    arrangeCompleted()
    mocks.prismaMock.financialIdempotencyKey.create.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed on the key"), {
        code: "P2002", meta: { target: "key" },
      }),
    )
    mocks.prismaMock.financialIdempotencyKey.findUnique.mockResolvedValue({
      scope: "vendor_payment_reverse",
      payloadHash: "9757f573a9c48b03a2de6c10d888bd8b70719e36adbfbcb4a7871d8450476a78",
      resultRefType: "VendorPayment", resultRefId: 1, createdBy: 7,
    })
    const res = await purchaseActions.reverseVendorPayment(1, REASON, "idemkey-vendor-001")
    expect(res.success).toBe(true)
    expect((res as any).replayed).toBe(true)
    expect(mocks.prismaMock.journal.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorPayment.update).not.toHaveBeenCalled()
  })
})

describe("FIN-BR-008 reverseSalesPayment", () => {
  function arrangePosted() {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({
      id: 2, status: "posted", amount: 750, withholdingAmount: 0, salesInvoiceId: 31,
    })
    mocks.prismaMock.journal.findMany.mockResolvedValue([
      {
        id: 61, status: "POSTED", transactionDate: new Date("2026-10-02"),
        journalNumber: "JRN-61", type: "receipt",
        totalDebit: 750, totalCredit: 750,
        entries: [
          { accountId: 101, debit: 750, credit: 0, memo: "Kas", costCenterId: null, profitCenterId: null },
          { accountId: 102, debit: 0, credit: 750, memo: "Piutang", costCenterId: null, profitCenterId: null },
        ],
      },
    ])
    mocks.prismaMock.journal.create.mockResolvedValue({ id: 98 })
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({
      id: 31, status: "paid", grandTotal: 1000,
    })
    // Sisa pembayaran aktif sesudah yang ini di-reverse: 250.
    mocks.prismaMock.salesPayment.findMany.mockResolvedValue([
      { amount: 250, withholdingAmount: 0 },
    ])
  }

  it("alasan kosong ditolak sebelum mutasi apa pun", async () => {
    const res = await salesActions.reverseSalesPayment(2, " ")
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.salesPayment.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.journal.create).not.toHaveBeenCalled()
  })

  it("posted: baris + jurnal asal tetap ada, status reversed beralasan, piutang faktur kembali (paid->partial)", async () => {
    arrangePosted()
    const res = await salesActions.reverseSalesPayment(2, REASON)
    expect(res.success).toBe(true)

    expect(mocks.prismaMock.journal.create).toHaveBeenCalled()
    expect(mocks.prismaMock.journal.update).toHaveBeenCalledWith({
      where: { id: 61 }, data: { status: "REVERSED" },
    })
    expect(mocks.prismaMock.journal.delete).not.toHaveBeenCalled()
    expect(mocks.prismaMock.salesPayment.delete).not.toHaveBeenCalled()

    const payUpdate = mocks.prismaMock.salesPayment.update.mock.calls[0][0]
    expect(payUpdate.data.status).toBe("reversed")
    expect(payUpdate.data.reversalReason).toBe(REASON)

    const invUpdate = mocks.prismaMock.salesInvoice.update.mock.calls.at(-1)[0]
    expect(Number(invUpdate.data.paidAmount)).toBe(250)
    expect(invUpdate.data.status).toBe("partial")
    expect(mocks.logActivityMock).toHaveBeenCalledWith(
      "reverse", "SalesPayment", 2,
      expect.stringContaining(REASON),
    )
  })

  it("bupot aktif: ditolak sampai revoke dulu, nol mutasi", async () => {
    arrangePosted()
    mocks.prismaMock.withholdingCertificate.findFirst.mockResolvedValue({
      id: 5, certificateNumber: "BPE-001",
    })
    const res = await salesActions.reverseSalesPayment(2, REASON)
    expect(res.success).toBe(false)
    expect(res.error).toContain("Batalkan bukti potong")
    expect(mocks.prismaMock.journal.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.salesPayment.update).not.toHaveBeenCalled()
  })

  it("periode terkunci: ditolak, nol mutasi", async () => {
    arrangePosted()
    mocks.assertPeriodOpenMock.mockRejectedValue(new Error("Periode sudah dikunci"))
    const res = await salesActions.reverseSalesPayment(2, REASON)
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.salesPayment.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.salesInvoice.update).not.toHaveBeenCalled()
  })

  it("reversal kedua ditolak (sudah reversed)", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({
      id: 2, status: "reversed", amount: 750, withholdingAmount: 0, salesInvoiceId: 31,
    })
    const res = await salesActions.reverseSalesPayment(2, REASON)
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah dibalik")
    expect(mocks.prismaMock.journal.create).not.toHaveBeenCalled()
  })

  it("deleteSalesPayment terposting ditolak (wajib reversal), baris tidak terhapus", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({
      id: 2, status: "posted", amount: 750, withholdingAmount: 0, salesInvoiceId: 31,
    })
    mocks.prismaMock.journal.findFirst.mockResolvedValue({ id: 61 })
    const res = await salesActions.deleteSalesPayment(2)
    expect(res.success).toBe(false)
    expect(res.error).toContain("tidak dapat dihapus")
    expect(mocks.prismaMock.salesPayment.delete).not.toHaveBeenCalled()
  })
})

describe("FIN-BR-008 recalc mengecualikan pembayaran reversed", () => {
  it("query pembayaran recalc menyaring status reversed", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({
      id: 31, status: "partial", grandTotal: 1000,
    })
    mocks.prismaMock.salesPayment.findMany.mockResolvedValue([
      { amount: 250, withholdingAmount: 0 },
    ])
    await onSalesPaymentDeleted(31, mocks.prismaMock as never)
    expect(mocks.prismaMock.salesPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "reversed" } }),
      }),
    )
  })
})
