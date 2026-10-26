import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * AUD-NEXT-03/04/07: kredit pelanggan operasional penuh.
 * - NEXT-03: DP lanjutan > sisa faktur → cap paidAmount + kredit selisih.
 * - NEXT-04: alokasi/refund tolak melebihi saldo; lock baris di tx.
 * - NEXT-07: itemId 0 = baris jasa/custom (terdokumentasi, bukan item stok).
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  creditFindUnique: vi.fn(),
  creditFindFirst: vi.fn(),
  creditCreate: vi.fn(),
  creditUpdate: vi.fn(),
  invoiceFindUnique: vi.fn(),
  invoiceUpdate: vi.fn(),
  paymentCreate: vi.fn(),
  paymentFindFirst: vi.fn(),
  paymentFindMany: vi.fn(),
  journalCreate: vi.fn(),
  docNo: vi.fn(),
  settingFindFirst: vi.fn(),
  idemCreate: vi.fn(),
  idemFindUnique: vi.fn(),
  idemUpdate: vi.fn(),
  dpFindUnique: vi.fn(),
  taxInvoiceFindFirst: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: any) => mocks.transaction(fn),
    customerCredit: {
      findUnique: (...a: unknown[]) => mocks.creditFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => mocks.creditFindUnique(...a),
      findFirst: (...a: unknown[]) => mocks.creditFindFirst(...a),
      create: (...a: unknown[]) => mocks.creditCreate(...a),
      update: (...a: unknown[]) => mocks.creditUpdate(...a),
    },
    salesInvoice: {
      findUnique: (...a: unknown[]) => mocks.invoiceFindUnique(...a),
      update: (...a: unknown[]) => mocks.invoiceUpdate(...a),
    },
    salesPayment: {
      create: (...a: unknown[]) => mocks.paymentCreate(...a),
      findFirst: (...a: unknown[]) => mocks.paymentFindFirst(...a),
      findMany: (...a: unknown[]) => mocks.paymentFindMany(...a),
    },
    journal: { create: (...a: unknown[]) => mocks.journalCreate(...a) },
    systemSetting: {
      findFirst: (...a: unknown[]) => mocks.settingFindFirst(...a),
    },
    financialIdempotencyKey: {
      create: (...a: unknown[]) => mocks.idemCreate(...a),
      findUnique: (...a: unknown[]) => mocks.idemFindUnique(...a),
      update: (...a: unknown[]) => mocks.idemUpdate(...a),
    },
  },
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.docNo(...a),
}))

vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesPaymentCreated: vi.fn().mockResolvedValue(undefined),
  onSalesInvoicePosted: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: vi.fn().mockResolvedValue({
    cashBankAccountId: 100,
    customerDownPaymentAccountId: 210102,
    salesReceivableAccountId: 110,
    salesTaxAccountId: 210201,
  }),
}))

vi.mock("@/lib/utils/error", () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

import {
  allocateCreditToInvoice,
  refundCredit,
  creditBalance,
} from "../customer-credit.service"

function buildTx() {
  return {
    // tx period-lock baca `tx.$queryRaw` (rows system_settings), bukan findFirst.
    // Hormati periodLockDate yang sama dengan settingFindFirst tiap tes.
    $queryRaw: vi.fn().mockImplementation(async () => {
      const s = await mocks.settingFindFirst()
      return [{ id: 1, period_lock_date: s?.periodLockDate ?? null }]
    }),
    // BLOCKER-1 F-036-S: mock panel snapshot komisi (kategori 1, tarif 2%
    // berlaku sepanjang 2026).
    customer: { findUnique: vi.fn().mockResolvedValue({ customerCategoryId: 1 }) },
    customerCommissionRate: {
      findMany: vi.fn().mockResolvedValue([
        { id: 1, customerCategoryId: 1, commissionPercent: 2, effectiveFrom: new Date(Date.UTC(2026, 0, 1)), effectiveTo: null },
      ]),
    },
    customerCredit: {
      findUniqueOrThrow: mocks.creditFindUnique,
      findFirst: mocks.creditFindFirst,
      create: mocks.creditCreate,
      update: mocks.creditUpdate,
    },
    salesInvoice: {
      findUniqueOrThrow: mocks.invoiceFindUnique,
      update: mocks.invoiceUpdate,
    },
    salesPayment: {
      create: mocks.paymentCreate,
      findFirst: mocks.paymentFindFirst,
      findMany: mocks.paymentFindMany,
    },
    journal: { create: mocks.journalCreate, findFirst: vi.fn().mockResolvedValue(null) },
    downPayment: { findUnique: mocks.dpFindUnique },
    taxInvoice: { findFirst: mocks.taxInvoiceFindFirst },
    systemSetting: { findFirst: mocks.settingFindFirst },
    financialIdempotencyKey: {
      create: (...a: unknown[]) => mocks.idemCreate(...a),
      findUnique: (...a: unknown[]) => mocks.idemFindUnique(...a),
      update: (...a: unknown[]) => mocks.idemUpdate(...a),
    },
  }
}


function seedCredit(over: Record<string, unknown> = {}) {
  mocks.creditFindUnique.mockResolvedValue({
    id: 1, documentNo: "CC-1", customerId: 9,
    receivedAmount: 3000, allocatedAmount: 0, refundedAmount: 0, status: "open",
    ...over,
  })
}

function seedInvoice(over: Record<string, unknown> = {}) {
  mocks.invoiceFindUnique.mockResolvedValue({
    id: 101, customerId: 9, documentNo: "INV-1", grandTotal: 10000, paidAmount: 8000, status: "posted",
    date: new Date(Date.UTC(2026, 0, 10)), commissionRatePercent: null,
    ...over,
  })
}


function dupKeyError() {
  return Object.assign(new Error("Unique constraint failed on the fields: (`key`)"), { code: "P2002", meta: { target: "key" } })
}

async function fingerprint() {
  const { payloadFingerprint } = await import("../financial-idempotency.service")
  return payloadFingerprint
}

describe("customer-credit.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.docNo.mockImplementation((p: string) => Promise.resolve(`${p}-1`))
    mocks.transaction.mockImplementation(async (fn: any) => fn(buildTx()))
    mocks.paymentCreate.mockResolvedValue({ id: 999 })
    mocks.paymentFindFirst.mockResolvedValue(null)
    mocks.settingFindFirst.mockResolvedValue({ periodLockDate: null })
    mocks.paymentFindMany.mockResolvedValue([{ amount: 8000 }, { amount: 2000 }])
    mocks.idemCreate.mockResolvedValue({ id: 1 })
    mocks.idemFindUnique.mockResolvedValue(null)
    mocks.idemUpdate.mockResolvedValue({})
    mocks.invoiceUpdate.mockResolvedValue({})
    mocks.creditUpdate.mockResolvedValue({})
    mocks.journalCreate.mockResolvedValue({ id: 1 })
    mocks.dpFindUnique.mockResolvedValue(null)
    mocks.taxInvoiceFindFirst.mockResolvedValue(null)
  })

  it("alokasi normal: kurangi saldo + lunasi faktur + jurnal Dr 210102 / Cr Piutang TANPA kas", async () => {
    seedCredit()
    seedInvoice()
    const r = await allocateCreditToInvoice(1, 101, 2000, 7, "11111111-1111-4111-8111-111111111111")
    expect(r.success).toBe(true)
    // Lock baris dulu (suntik race ditolak antre di sini).
    const txCalls: string[] = []
    expect(mocks.transaction).toHaveBeenCalled()
    void txCalls
    expect(mocks.paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethod: "customer_credit",
          amount: 2000,
        }),
      }),
    )
    // AUD-FIN-03: jurnal alokasi = Dr kewajiban UMP 210102 / Cr Piutang —
    // BUKAN Dr Kas. Kas sudah dijurnal saat terima DP/kredit.
    const allocCall = mocks.journalCreate.mock.calls.find(
      (c: any) => c?.[0]?.data?.referenceType === "SalesPayment" && c?.[0]?.data?.referenceId === 999,
    )
    expect(allocCall).toBeDefined()
    const allocEntries = allocCall![0].data.entries.create as Array<{ accountId: number; debit: number; credit: number }>
    expect(allocEntries).toHaveLength(2)
    // Falsifikasi kas double-count: satu-satunya baris DEBIT = 210102.
    const debitLines = allocEntries.filter((e) => Number(e.debit) > 0)
    expect(debitLines).toHaveLength(1)
    expect(debitLines[0].accountId).toBe(210102)
    expect(debitLines[0].debit).toBe(2000)
    expect(allocEntries.find((e) => Number(e.credit) > 0)?.credit).toBe(2000)
    expect(mocks.creditUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ allocatedAmount: 2000, status: "open" }),
      }),
    )
    // paidAmount = min(8000+2000, 10000) = 10000 → paid.
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidAmount: 10000, paymentStatus: "paid" }),
      }),
    )
  })

  it("BLOCKER-1 F-036-S: alokasi melunasi -> snapshot tarif beku 2% per tanggal faktur", async () => {
    seedCredit()
    seedInvoice()
    const r = await allocateCreditToInvoice(1, 101, 2000, 7, "66666666-6666-4666-8666-666666666666")
    expect(r.success).toBe(true)
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: "paid",
          commissionCustomerCategoryId: 1,
          commissionRateId: 1,
        }),
      }),
    )
    const data = mocks.invoiceUpdate.mock.calls[0][0].data
    expect(Number(data.commissionRatePercent)).toBe(2)
  })

  it("BLOCKER-1 F-036-S: snapshot existing tidak ditulis ulang oleh alokasi kredit", async () => {
    seedCredit()
    seedInvoice({ commissionRatePercent: 7 })
    const r = await allocateCreditToInvoice(1, 101, 2000, 7, "77777777-7777-4777-8777-777777777777")
    expect(r.success).toBe(true)
    const data = mocks.invoiceUpdate.mock.calls[0][0].data
    expect(data.commissionRatePercent).toBeUndefined()
    expect(data.commissionRateId).toBeUndefined()
  })

  it("BLOCKER-1 F-036-S: alokasi partial tidak menulis snapshot", async () => {
    seedCredit({ receivedAmount: 1000 })
    seedInvoice()
    mocks.paymentFindMany.mockResolvedValue([{ amount: 8000 }, { amount: 1000 }])
    const r = await allocateCreditToInvoice(1, 101, 1000, 7, "88888888-8888-4888-8888-888888888888")
    expect(r.success).toBe(true)
    const data = mocks.invoiceUpdate.mock.calls[0][0].data
    expect(data.paymentStatus).toBe("partial")
    expect(data.commissionRatePercent).toBeUndefined()
  })

  it("alokasi habiskan saldo: status jadi used", async () => {
    seedCredit()
    seedInvoice({ paidAmount: 7000 })
    mocks.paymentFindMany.mockResolvedValue([{ amount: 7000 }, { amount: 3000 }])
    const r = await allocateCreditToInvoice(1, 101, 3000, 7, "22222222-2222-4222-8222-222222222222")
    expect(r.success).toBe(true)
    expect(mocks.creditUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "used" }) }),
    )
  })

  it("alokasi > saldo: DITOLAK (tak ada jurnal setengah jalan)", async () => {
    seedCredit({ allocatedAmount: 1000 })
    const r = await allocateCreditToInvoice(1, 101, 2500, 7, "33333333-3333-4333-8333-333333333333")
    expect(r.success).toBe(false)
    expect(r.error).toContain("tidak cukup")
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
    expect(mocks.creditUpdate).not.toHaveBeenCalled()
  })

  it("alokasi > sisa faktur: DITOLAK", async () => {
    seedCredit({ receivedAmount: 9000 })
    seedInvoice()
    const r = await allocateCreditToInvoice(1, 101, 5000, 7, "44444444-4444-4444-8444-444444444444")
    expect(r.success).toBe(false)
    expect(r.error).toContain("sisa faktur")
  })

  it("alokasi ke faktur batal: DITOLAK", async () => {
    seedCredit({ receivedAmount: 9000 })
    seedInvoice({ paidAmount: 0, status: "cancelled" })
    const r = await allocateCreditToInvoice(1, 101, 1000, 7, "55555555-5555-4555-8555-555555555555")
    expect(r.success).toBe(false)
    expect(r.error).toContain("batal")
  })

  it("refund normal: jurnal Dr 210102 / Cr Kas + status refunded bila habis", async () => {
    seedCredit({ allocatedAmount: 1000 })
    const r = await refundCredit(1, 2000, 7, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1")
    expect(r.success).toBe(true)
    expect(mocks.journalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceType: "CustomerCredit",
          entries: {
            create: [
              expect.objectContaining({ accountId: 210102, debit: 2000 }),
              expect.objectContaining({ accountId: 100, credit: 2000 }),
            ],
          },
        }),
      }),
    )
    expect(mocks.creditUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refundedAmount: 2000, status: "refunded" }),
      }),
    )
  })

  it("refund > saldo: DITOLAK tanpa jurnal", async () => {
    seedCredit({ allocatedAmount: 1000 })
    const r = await refundCredit(1, 2500, 7, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2")
    expect(r.success).toBe(false)
    expect(r.error).toContain("tidak cukup")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("alokasi ke faktur pelanggan LAIN: DITOLAK tanpa payment (AUD-R4-02)", async () => {
    seedCredit({ receivedAmount: 9000 })
    seedInvoice({ customerId: 77, paidAmount: 0 })
    const r = await allocateCreditToInvoice(1, 101, 1000, 7, "66666666-6666-4666-8666-666666666666")
    expect(r.success).toBe(false)
    expect(r.error).toContain("tidak bisa dialokasikan")
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
    expect(mocks.creditUpdate).not.toHaveBeenCalled()
  })

  it("tanpa key: DITOLAK mentah (AUD-R7-01, kompatibel lama dicabut)", async () => {
    const r = await allocateCreditToInvoice(1, 101, 2000, 7)
    expect(r.success).toBe(false)
    expect(r.error).toContain("wajib idempotency key")
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
    expect(mocks.idemCreate).not.toHaveBeenCalled()
  })

  it("refund saat periode ditutup: DITOLAK tanpa jurnal/saldo (AUD-R4-05)", async () => {
    seedCredit({ allocatedAmount: 1000 })
    // Lock = "ditutup SAMPAI tanggal ini": lock hari ini → refund hari ini ditolak.
    mocks.settingFindFirst.mockResolvedValue({ periodLockDate: new Date() })
    const r = await refundCredit(1, 1000, 7, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4")
    expect(r.success).toBe(false)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.creditUpdate).not.toHaveBeenCalled()
  })

  it("retry key SAMA: replay tanpa payment kedua (AUD-R5-02)", async () => {
    seedCredit({ receivedAmount: 9000 })
    seedInvoice()
    // Klaim kedua = UNIQUE violation = replay.
    const dupErr = dupKeyError()
    mocks.idemCreate.mockRejectedValueOnce(dupErr)
    const fp1 = await fingerprint()
    mocks.idemFindUnique.mockResolvedValueOnce({
      scope: "customer_credit_allocate",
      payloadHash: fp1({ scope: "customer_credit_allocate", creditId: 1, salesInvoiceId: 101, amount: 2000 }),
      resultRefType: "SalesPayment", resultRefId: 555, createdBy: 7,
    })
    const r = await allocateCreditToInvoice(1, 101, 2000, 7, "cccccccc-cccc-4ccc-8ccc-ccccccccccc1")
    expect(r.success).toBe(true)
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
    expect(mocks.creditUpdate).not.toHaveBeenCalled()
  })

  it("key BEDA nominal sama: dua operasi sah tercatat (AUD-R5-02)", async () => {
    seedCredit({ receivedAmount: 9000 })
    seedInvoice()
    const r1 = await allocateCreditToInvoice(1, 101, 1000, 7, "cccccccc-cccc-4ccc-8ccc-ccccccccccc2")
    const r2 = await allocateCreditToInvoice(1, 101, 1000, 7, "cccccccc-cccc-4ccc-8ccc-ccccccccccc3")
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    expect(mocks.paymentCreate).toHaveBeenCalledTimes(2)
  })

  it("refund retry key SAMA: satu jurnal saja (AUD-R5-01)", async () => {
    seedCredit({ receivedAmount: 5000 })
    const r1 = await refundCredit(1, 1000, 7, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1")
    expect(r1.success).toBe(true)
    expect(mocks.journalCreate).toHaveBeenCalledTimes(1)
    const dupErr = dupKeyError()
    mocks.idemCreate.mockRejectedValueOnce(dupErr)
    const fp2 = await fingerprint()
    mocks.idemFindUnique.mockResolvedValueOnce({
      scope: "customer_credit_refund",
      payloadHash: fp2({ scope: "customer_credit_refund", creditId: 1, amount: 1000 }),
      resultRefType: "Journal", resultRefId: 42, createdBy: 7,
    })
    const r2 = await refundCredit(1, 1000, 7, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1")
    expect(r2.success).toBe(true)
    expect(r2.replayed).toBe(true)
    expect(r2.journalId).toBe(42)
    expect(mocks.journalCreate).toHaveBeenCalledTimes(1)
    expect(mocks.creditUpdate).toHaveBeenCalledTimes(1)
  })

  it("key dipakai scope LAIN: DITOLAK bukan sukses palsu (AUD-R6-02)", async () => {
    seedCredit({ receivedAmount: 5000 })
    const dupErr = dupKeyError()
    mocks.idemCreate.mockRejectedValueOnce(dupErr)
    // Key milik alokasi dipakai untuk refund → konflik.
    const fp3 = await fingerprint()
    mocks.idemFindUnique.mockResolvedValueOnce({
      scope: "customer_credit_allocate",
      payloadHash: fp3({ scope: "customer_credit_refund", creditId: 1, amount: 1000 }),
      resultRefType: "SalesPayment", resultRefId: 999, createdBy: 7,
    })
    const r = await refundCredit(1, 1000, 7, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2")
    expect(r.success).toBe(false)
    expect(r.error).toContain("operasi lain")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.creditUpdate).not.toHaveBeenCalled()
  })

  it("key tanpa hasil final: DITOLAK bukan sukses palsu (AUD-R6-02)", async () => {
    seedCredit({ receivedAmount: 5000 })
    const dupErr = dupKeyError()
    mocks.idemCreate.mockRejectedValueOnce(dupErr)
    const fp4 = await fingerprint()
    mocks.idemFindUnique.mockResolvedValueOnce({
      scope: "customer_credit_refund",
      payloadHash: fp4({ scope: "customer_credit_refund", creditId: 1, amount: 1000 }),
      resultRefType: "Journal", resultRefId: null, createdBy: 7,
    })
    const r = await refundCredit(1, 1000, 7, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3")
    expect(r.success).toBe(false)
    expect(r.error).toContain("belum selesai")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("refund TANPA key: DITOLAK mentah (AUD-R6-05)", async () => {
    const r = await refundCredit(1, 1000, 7)
    expect(r.success).toBe(false)
    expect(r.error).toContain("wajib idempotency key")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.creditUpdate).not.toHaveBeenCalled()
  })

  it("alokasi TANPA key: DITOLAK sebelum mutasi (AUD-R7-01)", async () => {
    const r = await allocateCreditToInvoice(1, 101, 1000, 7)
    expect(r.success).toBe(false)
    expect(r.error).toContain("wajib idempotency key")
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
    expect(mocks.creditUpdate).not.toHaveBeenCalled()
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled()
  })

  it("alokasi key CACAT: DITOLAK (AUD-R7-01)", async () => {
    const r = await allocateCreditToInvoice(1, 101, 1000, 7, "x!!")
    expect(r.success).toBe(false)
    expect(r.error).toContain("wajib idempotency key")
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
  })

  it("konflik key tapi baris tak terbaca: ERROR eksplisit bukan sukses (AUD-R7-02)", async () => {
    seedCredit({ receivedAmount: 9000 })
    seedInvoice()
    const dupErr = dupKeyError()
    mocks.idemCreate.mockRejectedValueOnce(dupErr)
    mocks.idemFindUnique.mockResolvedValueOnce(null)
    const r = await allocateCreditToInvoice(1, 101, 2000, 7, "550e8400-e29b-41d4-a716-446655440000")
    expect(r.success).toBe(false)
    expect(r.error).toContain("tanpa hasil terbaca")
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
    expect(mocks.creditUpdate).not.toHaveBeenCalled()
  })

  it("replay alokasi kembalikan paymentId awal (AUD-R7-03)", async () => {
    seedCredit({ receivedAmount: 9000 })
    seedInvoice()
    const dupErr = dupKeyError()
    mocks.idemCreate.mockRejectedValueOnce(dupErr)
    const fp5 = await fingerprint()
    mocks.idemFindUnique.mockResolvedValueOnce({
      scope: "customer_credit_allocate",
      payloadHash: fp5({ scope: "customer_credit_allocate", creditId: 1, salesInvoiceId: 101, amount: 2000 }),
      resultRefType: "SalesPayment", resultRefId: 777, createdBy: 7,
    })
    const r = await allocateCreditToInvoice(1, 101, 2000, 7, "550e8400-e29b-41d4-a716-446655440001")
    expect(r.success).toBe(true)
    expect(r.replayed).toBe(true)
    expect(r.paymentId).toBe(777)
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
  })

  it("key sama payload BEDA (nominal lain): KONFLIK bukan replay (AUD-R8-02)", async () => {
    seedCredit({ receivedAmount: 9000 })
    seedInvoice()
    const dupErr = dupKeyError()
    mocks.idemCreate.mockRejectedValueOnce(dupErr)
    // Key milik intent nominal 1000 dipakai untuk nominal 2000.
    const fp = await fingerprint()
    mocks.idemFindUnique.mockResolvedValueOnce({
      scope: "customer_credit_allocate",
      payloadHash: fp({ scope: "customer_credit_allocate", creditId: 1, salesInvoiceId: 101, amount: 1000 }),
      resultRefType: "SalesPayment", resultRefId: 555, createdBy: 7,
    })
    const r = await allocateCreditToInvoice(1, 101, 2000, 7, "dddddddd-dddd-4ddd-8ddd-dddddddddddd")
    expect(r.success).toBe(false)
    expect(r.error).toContain("nominal/target berbeda")
    expect(r.ambiguous).toBe(false)
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
  })

  it("replay tipe hasil SALAH: DITOLAK bukan ID palsu (AUD-R8-03)", async () => {
    seedCredit({ receivedAmount: 9000 })
    seedInvoice()
    const dupErr = dupKeyError()
    mocks.idemCreate.mockRejectedValueOnce(dupErr)
    const fp6 = await fingerprint()
    mocks.idemFindUnique.mockResolvedValueOnce({
      scope: "customer_credit_allocate",
      payloadHash: fp6({ scope: "customer_credit_allocate", creditId: 1, salesInvoiceId: 101, amount: 2000 }),
      resultRefType: "Journal", resultRefId: 42, createdBy: 7,
    })
    const r = await allocateCreditToInvoice(1, 101, 2000, 7, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")
    expect(r.success).toBe(false)
    expect(r.error).toContain("tidak valid")
    expect(r.ambiguous).toBe(false)
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
  })

  it("gagal AMBIGU (koneksi putus): flag ambiguous true = UI tahan key (AUD-R8-01)", async () => {
    seedCredit({ receivedAmount: 9000 })
    seedInvoice()
    mocks.idemCreate.mockRejectedValueOnce(new Error("connection lost"))
    const r = await allocateCreditToInvoice(1, 101, 2000, 7, "ffffffff-ffff-4fff-8fff-ffffffffffff")
    expect(r.success).toBe(false)
    expect(r.error).toContain("connection lost")
    expect(r.ambiguous).toBe(true)
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
  })

  it("fingerprint SHA-256: stabil, urutan-bebas, beda payload beda (AUD-R9-04)", async () => {
    const { payloadFingerprint } = await import("../financial-idempotency.service")
    const a = payloadFingerprint({ scope: "x", creditId: 1, amount: 2000 })
    const b = payloadFingerprint({ amount: 2000, creditId: 1, scope: "x" })
    const c = payloadFingerprint({ scope: "x", creditId: 1, amount: 3000 })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it("alokasi tanpa akun 210102: DITOLAK sebelum mutasi (fail-closed AUD-FIN-03)", async () => {
    const { getSystemSettings } = await import("@/lib/utils/settings")
    vi.mocked(getSystemSettings).mockResolvedValueOnce({ customerDownPaymentAccountId: null } as never)
    const r = await allocateCreditToInvoice(1, 101, 1000, 7, "99999999-9999-4999-8999-999999999999")
    expect(r.success).toBe(false)
    expect(r.error).toContain("210102")
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
    expect(mocks.creditUpdate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("E-DP-PPN (7): refund kredit sumber DP terutang ditolak saat FP UM aktif; sesudah FP batal J-RF1 pecah 210102/210201", async () => {
    // Kredit 12.000.000 dari DP id 7 (snapshot beku: PPN 1.320.000, 210102 10.680.000).
    seedCredit({ receivedAmount: 12_000_000, sourceType: "DownPayment", sourceId: 7 })
    mocks.dpFindUnique.mockResolvedValue({
      id: 7,
      amount: 12_000_000,
      vatTransactionCode: "04",
      vatRate: 12,
      vatDpp: 11_000_000,
      vatAmount: 1_320_000,
      vatTaxPeriod: "2026-01",
    })
    // FP UM aktif (belum batal) -> refund ditolak, tanpa jurnal/saldo berubah.
    mocks.taxInvoiceFindFirst.mockResolvedValue({ id: 501 })
    const blocked = await refundCredit(1, 12_000_000, 7, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7")
    expect(blocked.success).toBe(false)
    expect(blocked.error).toContain("masih aktif")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.creditUpdate).not.toHaveBeenCalled()

    // FP UM sudah batal (query aktif tidak menemukan) -> J-RF1 seimbang.
    mocks.taxInvoiceFindFirst.mockResolvedValue(null)
    const ok = await refundCredit(1, 12_000_000, 7, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8")
    expect(ok.success).toBe(true)
    const entries = mocks.journalCreate.mock.calls[0][0].data.entries.create as Array<{
      accountId: number; debit: number; credit: number
    }>
    expect(entries).toEqual([
      expect.objectContaining({ accountId: 210102, debit: 10_680_000, credit: 0 }),
      expect.objectContaining({ accountId: 210201, debit: 1_320_000, credit: 0 }),
      expect.objectContaining({ accountId: 100, debit: 0, credit: 12_000_000 }),
    ])
    expect(mocks.creditUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refundedAmount: 12_000_000, status: "refunded" }),
      }),
    )
  })

  it("creditBalance = received - allocated - refunded", async () => {
    mocks.creditFindUnique.mockResolvedValue({
      receivedAmount: 3000, allocatedAmount: 1000, refundedAmount: 500,
    })
    expect(await creditBalance(1)).toBe(1500)
  })
})
