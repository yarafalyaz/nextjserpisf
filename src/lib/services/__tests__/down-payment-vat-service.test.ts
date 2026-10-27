import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  dpFindUnique: vi.fn(),
  tiFindFirst: vi.fn(),
  tiCreate: vi.fn(),
  claim: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: any) =>
      fn({
        downPayment: { findUnique: mocks.dpFindUnique },
        taxInvoice: { findFirst: mocks.tiFindFirst, create: mocks.tiCreate },
      }),
    ),
  },
}))

vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/services/financial-idempotency.service", () => ({
  claimIdempotencyKey: mocks.claim,
  bindIdempotencyKey: vi.fn().mockResolvedValue(undefined),
  isValidIdempotencyKey: (k: unknown) => typeof k === "string" && k.length >= 8,
  isDefinitiveError: (e: unknown) => e instanceof Error && (e as any).definitive === true,
  definitive: (msg: string) => Object.assign(new Error(msg), { definitive: true }),
  payloadFingerprint: () => "fp-test",
}))

import { issueDownPaymentTaxInvoice } from "@/lib/services/tax-invoice.service"

const DP = {
  id: 7,
  status: "confirmed",
  amount: 12_000_000,
  paymentDate: new Date(2026, 0, 15),
  vatTransactionCode: "04",
  vatRate: 12,
  vatDpp: 11_000_000,
  vatAmount: 1_320_000,
  vatTaxPeriod: "2026-01",
  customerId: 42,
  customer: { name: "PT Uji", taxpayerName: "PT Uji WP", taxId: "0123456789123456", nitku: "0123456789123456000001" },
}

const INPUT = {
  downPaymentId: 7,
  taxInvoiceNumber: "040.000-26.00000001",
  idempotencyKey: "idem-key-0001",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.dpFindUnique.mockResolvedValue(DP)
  mocks.tiFindFirst.mockResolvedValue(null)
  mocks.tiCreate.mockResolvedValue({ id: 501 })
  mocks.claim.mockResolvedValue({ replayed: false })
})

describe("B5(4) terbit FP UM anti-replay", () => {
  it("replay idempotency key sama -> replayed=true, FP tidak dibuat dua kali", async () => {
    const first = await issueDownPaymentTaxInvoice(INPUT)
    expect(first).toMatchObject({ success: true, replayed: false, id: 501 })
    expect(mocks.tiCreate).toHaveBeenCalledTimes(1)

    mocks.claim.mockResolvedValue({ replayed: true, resultRefId: 501 })
    const second = await issueDownPaymentTaxInvoice(INPUT)
    expect(second).toMatchObject({ success: true, replayed: true, id: 501 })
    expect(mocks.tiCreate).toHaveBeenCalledTimes(1)
  })

  it("key BARU tapi DP sudah punya FP UM aktif -> ditolak, tidak ada FP kedua", async () => {
    // findFirst diskriminasi: cek FP aktif per DP menemukan baris; cek nomor duplikat null.
    mocks.tiFindFirst.mockImplementation((args: any) =>
      Promise.resolve(args?.where?.downPaymentId != null ? { id: 501 } : null),
    )
    const r = await issueDownPaymentTaxInvoice({ ...INPUT, idempotencyKey: "idem-key-0002" })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/sudah memiliki FP uang muka aktif/)
    expect(mocks.tiCreate).not.toHaveBeenCalled()
  })

  it("DP tanpa snapshot beku -> ditolak (tidak hitung ulang)", async () => {
    mocks.dpFindUnique.mockResolvedValue({ ...DP, vatDpp: null, vatAmount: null })
    const r = await issueDownPaymentTaxInvoice(INPUT)
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/Snapshot PPN uang muka belum dibekukan/)
    expect(mocks.tiCreate).not.toHaveBeenCalled()
  })

  it("FP terbit membawa snapshot: DPP/PPN/tarif/masa dari DP, status draf", async () => {
    await issueDownPaymentTaxInvoice(INPUT)
    const data = mocks.tiCreate.mock.calls[0][0].data
    expect(data).toMatchObject({
      dpp: expect.objectContaining({ toString: expect.any(Function) }),
      djpStatus: "draft",
      downPaymentId: 7,
      taxPeriod: "2026-01",
      transactionCode: "04",
    })
    expect(Number(data.dpp)).toBe(11_000_000)
    expect(Number(data.taxAmount)).toBe(1_320_000)
    expect(Number(data.taxRate)).toBe(12)
  })
})
