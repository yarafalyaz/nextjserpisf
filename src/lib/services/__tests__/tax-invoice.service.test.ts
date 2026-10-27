import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Guard service TaxInvoice (F-002(d), F-001): duplikat (direction,nomor)
 * + duplikat (vendor,nomor) non-batal ditolak keras; assertPeriodOpen
 * dalam tx; setting/COA fail-closed di jalur jurnal (pola hook existing).
 * Mock prisma: $transaction meneruskan tx mock (tanpa semantik rollback —
 * kontrak success:false + pesan definitif yang diuji, per atomisitas-transaksi).
 */

const mocks = vi.hoisted(() => {
  const taxInvoiceFindFirst = vi.fn()
  const taxInvoiceCreate = vi.fn()
  const taxInvoiceUpdate = vi.fn()
  const taxInvoiceFindUniqueOrThrow = vi.fn()
  const salesInvoiceUpdate = vi.fn()
  const vendorBillUpdate = vi.fn()
  const claimIdempotencyKey = vi.fn()
  const bindIdempotencyKey = vi.fn()
  const assertPeriodOpen = vi.fn()
  const queryRaw = vi.fn()

  const tx: Record<string, unknown> = {
    taxInvoice: {
      findFirst: taxInvoiceFindFirst,
      create: taxInvoiceCreate,
      update: taxInvoiceUpdate,
      findUniqueOrThrow: taxInvoiceFindUniqueOrThrow,
    },
    salesInvoice: { update: salesInvoiceUpdate },
    vendorBill: { update: vendorBillUpdate },
    $queryRaw: queryRaw,
  }
  const prisma = {
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  }
  return {
    taxInvoiceFindFirst, taxInvoiceCreate, taxInvoiceUpdate, taxInvoiceFindUniqueOrThrow,
    salesInvoiceUpdate, vendorBillUpdate, claimIdempotencyKey, bindIdempotencyKey,
    assertPeriodOpen, queryRaw, prisma, tx,
  }
})

vi.mock("@/lib/db/prisma", async () => ({ prisma: mocks.prisma, Prisma: (await import("@prisma/client")).Prisma }))
vi.mock("@/lib/services/period-lock.service", () => ({ assertPeriodOpen: (...a: unknown[]) => mocks.assertPeriodOpen(...a) }))
vi.mock("@/lib/services/financial-idempotency.service", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/services/financial-idempotency.service")>()
  return {
    ...orig,
    claimIdempotencyKey: (...a: unknown[]) => mocks.claimIdempotencyKey(...a),
    bindIdempotencyKey: (...a: unknown[]) => mocks.bindIdempotencyKey(...a),
  }
})

import { issueTaxInvoice, replaceTaxInvoice, cancelTaxInvoice, creditInputInvoice } from "@/lib/services/tax-invoice.service"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.claimIdempotencyKey.mockResolvedValue({ replayed: false })
  mocks.bindIdempotencyKey.mockResolvedValue(undefined)
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.queryRaw.mockResolvedValue([{ id: 1 }])
  mocks.taxInvoiceFindFirst.mockResolvedValue(null)
  mocks.taxInvoiceCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 7, ...data }),
  )
  mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue({
    id: 7, direction: "in", taxPeriod: "2026-01", taxAmount: 1_320_000,
    djpStatus: "draft", creditStatus: "uncredited", transactionCode: "04", taxRate: 12,
    salesInvoiceId: null, vendorBillId: 3,
    counterpartyTaxId: null, counterpartyName: null, counterpartyNitku: null, vendorId: 5,
  })
})

function key() {
  return `test-key-${Math.random().toString(36).slice(2, 10)}-ab`
}

describe("issueTaxInvoice guards", () => {
  it("F-002(d): duplikat (vendor,nomor) masukan non-batal ditolak definitif", async () => {
    mocks.taxInvoiceFindFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.vendorId != null) return Promise.resolve({ id: 9 })
      return Promise.resolve(null)
    })
    const r = await issueTaxInvoice({
      direction: "in", taxInvoiceNumber: "010.001-26.00000001",
      taxInvoiceDate: new Date(2026, 0, 10), sellingPrice: 12_000_000,
      vendorId: 5, vendorBillId: 3, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(r.ambiguous).toBe(false)
    expect(String(r.error)).toMatch(/Duplikat faktur masukan/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })

  it("duplikat (direction,nomor) global ditolak", async () => {
    mocks.taxInvoiceFindFirst.mockResolvedValue({ id: 11 })
    const r = await issueTaxInvoice({
      direction: "out", taxInvoiceNumber: "010.001-26.00000001",
      taxInvoiceDate: new Date(2026, 0, 10), sellingPrice: 12_000_000,
      salesInvoiceId: 1, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })

  it("terbit ok: DPP 11/12, cermin kepala rantai ditulis, bind key", async () => {
    const r = await issueTaxInvoice({
      direction: "out", taxInvoiceNumber: "010.001-26.00000002",
      taxInvoiceDate: new Date(2026, 0, 10), sellingPrice: 12_000_000,
      salesInvoiceId: 1, idempotencyKey: key(),
    })
    expect(r.success).toBe(true)
    expect(mocks.taxInvoiceCreate).toHaveBeenCalledTimes(1)
    const data = mocks.taxInvoiceCreate.mock.calls[0][0].data
    expect(Number(data.dpp)).toBe(11_000_000)
    expect(Number(data.taxAmount)).toBe(1_320_000)
    expect(data.transactionCode).toBe("04")
    expect(mocks.salesInvoiceUpdate).toHaveBeenCalled()
    expect(mocks.bindIdempotencyKey).toHaveBeenCalled()
  })
})

describe("replaceTaxInvoice guards", () => {
  const oldInvoice = {
    id: 7, direction: "out", taxPeriod: "2026-01", taxInvoiceNumber: "010.001-26.00000009",
    taxInvoiceDate: new Date(2026, 0, 10), taxAmount: 1_320_000,
    djpStatus: "approved", creditStatus: "uncredited", transactionCode: "04", taxRate: 12,
    salesInvoiceId: 1, vendorBillId: null, vendorId: null,
    counterpartyTaxId: null, counterpartyName: null, counterpartyNitku: null,
  }

  it("pengganti: masa SPT = masa faktur diganti, lama → replaced", async () => {
    mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue(oldInvoice)
    const r = await replaceTaxInvoice({
      replacesId: 7, taxInvoiceNumber: "010.001-26.00000009",
      taxInvoiceDate: new Date(2026, 2, 5), sellingPrice: 6_000_000,
      replaceReason: "salah DPP", idempotencyKey: key(),
    })
    expect(r.success).toBe(true)
    const data = mocks.taxInvoiceCreate.mock.calls[0][0].data
    expect(data.taxPeriod).toBe("2026-01")
    expect(data.replacesId).toBe(7)
    expect(Number(data.dpp)).toBe(5_500_000)
    expect(Number(data.taxAmount)).toBe(660_000)
    expect(mocks.taxInvoiceUpdate).toHaveBeenCalledWith(
      { where: { id: 7 }, data: { djpStatus: "replaced" } },
    )
  })

  it("nomor seri pengganti beda dari asal ditolak", async () => {
    mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue(oldInvoice)
    const r = await replaceTaxInvoice({
      replacesId: 7, taxInvoiceNumber: "010.001-26.99999999",
      taxInvoiceDate: new Date(2026, 2, 5), sellingPrice: 6_000_000,
      replaceReason: "salah DPP", idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/Nomor seri faktur pengganti wajib sama/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })

  it("faktur sudah diganti tidak bisa diganti lagi", async () => {
    mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue({ ...oldInvoice, djpStatus: "replaced" })
    const r = await replaceTaxInvoice({
      replacesId: 7, taxInvoiceNumber: "010.001-26.00000009",
      taxInvoiceDate: new Date(2026, 2, 5), sellingPrice: 6_000_000,
      replaceReason: "salah DPP", idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/sudah diganti/)
  })
})

describe("cancelTaxInvoice guards", () => {
  it("batal: status cancelled + cermin kepala dikosongkan bila tak ada yg hidup", async () => {
    mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue({
      id: 7, direction: "out", taxPeriod: "2026-01", taxInvoiceNumber: "010.001-26.00000009",
      taxInvoiceDate: new Date(2026, 0, 10), taxAmount: 1_320_000,
      djpStatus: "approved", creditStatus: "uncredited", transactionCode: "04", taxRate: 12,
      salesInvoiceId: 1, vendorBillId: null, vendorId: null,
      counterpartyTaxId: null, counterpartyName: null, counterpartyNitku: null,
    })
    mocks.taxInvoiceFindFirst.mockResolvedValue(null)
    const r = await cancelTaxInvoice({ id: 7, cancelReason: "transaksi batal", idempotencyKey: key() })
    expect(r.success).toBe(true)
    expect(mocks.taxInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: expect.objectContaining({ djpStatus: "cancelled" }) }),
    )
    expect(mocks.salesInvoiceUpdate).toHaveBeenCalledWith(
      { where: { id: 1 }, data: { taxInvoiceNumber: null } },
    )
  })
})

describe("creditInputInvoice guards", () => {
  it("F-002(c): bulan ke-4 → expired + ditolak", async () => {
    const r = await creditInputInvoice({ id: 7, creditPeriod: "2026-05", idempotencyKey: key() })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/expired/)
    expect(mocks.taxInvoiceUpdate).toHaveBeenCalledWith(
      { where: { id: 7 }, data: { creditStatus: "expired" } },
    )
  })

  // B4: mock di atas tidak mensimulasikan rollback, jadi tes F-002(c) lolos
  // walau kode lama menulis `expired` lalu throw di dalam $transaction
  // (rollback membuang statusnya). Tes ini memakai $transaction yang
  // membuang tulisan saat callback melempar — status expired hanya selamat
  // bila penulisannya ter-commit sebelum error dikembalikan.
  it("B4: status expired ter-commit walau error sampai ke pengguna (tanpa rollback)", async () => {
    const committed: unknown[] = []
    let pending: unknown[] = []
    const baseTx = mocks.tx as {
      taxInvoice: Record<string, unknown>
      [key: string]: unknown
    }
    const rollbackTx = {
      ...baseTx,
      taxInvoice: {
        ...baseTx.taxInvoice,
        update: (args: unknown) => {
          pending.push(args)
          return mocks.taxInvoiceUpdate(args as never)
        },
      },
    }
    const original = mocks.prisma.$transaction
    mocks.prisma.$transaction = async (fn: (tx: unknown) => unknown) => {
      pending = []
      try {
        const result = await fn(rollbackTx)
        committed.push(...pending)
        return result
      } catch (e) {
        pending = []
        throw e
      }
    }
    try {
      const r = await creditInputInvoice({ id: 7, creditPeriod: "2026-05", idempotencyKey: key() })
      expect(r.success).toBe(false)
      expect(String(r.error)).toMatch(/expired/)
      expect(committed).toContainEqual({ where: { id: 7 }, data: { creditStatus: "expired" } })
    } finally {
      mocks.prisma.$transaction = original
    }
  })

  it("duplikat kredit (sudah credited) ditolak", async () => {
    mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue({
      id: 7, direction: "in", taxPeriod: "2026-01", taxAmount: 100,
      djpStatus: "draft", creditStatus: "credited",
    })
    const r = await creditInputInvoice({ id: 7, creditPeriod: "2026-02", idempotencyKey: key() })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/sudah dikreditkan/)
  })
})
