import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Guard service WithholdingCertificate (F-003): akun fail-closed per arah,
 * snapshot pasal+kode+tarif dari master saat terbit, duplikat nomor ditolak,
 * setor scope `withholding_settle` bind ref TaxPayment.
 */

const mocks = vi.hoisted(() => {
  const certFindFirst = vi.fn()
  const certCreate = vi.fn()
  const certFindUniqueOrThrow = vi.fn()
  const certUpdate = vi.fn()
  const typeFindUniqueOrThrow = vi.fn()
  const typeFindMany = vi.fn()
  const accountFindMany = vi.fn()
  const taxPaymentCreate = vi.fn()
  const taxPaymentUpdate = vi.fn()
  const journalCreate = vi.fn()
  const claimIdempotencyKey = vi.fn()
  const bindIdempotencyKey = vi.fn()
  const assertPeriodOpen = vi.fn()
  const reverseJournals = vi.fn()
  const queryRaw = vi.fn()

  const tx: Record<string, unknown> = {
    withholdingCertificate: {
      findFirst: certFindFirst,
      create: certCreate,
      findUniqueOrThrow: certFindUniqueOrThrow,
      update: certUpdate,
    },
    withholdingTaxType: { findUniqueOrThrow: typeFindUniqueOrThrow, findMany: typeFindMany },
    account: { findMany: accountFindMany },
    taxPayment: { create: taxPaymentCreate, update: taxPaymentUpdate },
    journal: { create: journalCreate },
    $queryRaw: queryRaw,
  }
  const prisma = {
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  }
  return {
    certFindFirst, certCreate, certFindUniqueOrThrow, certUpdate,
    typeFindUniqueOrThrow, typeFindMany, accountFindMany, taxPaymentCreate, taxPaymentUpdate,
    journalCreate, claimIdempotencyKey, bindIdempotencyKey, assertPeriodOpen,
    reverseJournals, queryRaw, prisma,
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
vi.mock("@/lib/hooks/accounting.hook", () => ({
  reverseJournalsByReferenceTx: (...a: unknown[]) => mocks.reverseJournals(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn(async (prefix: string) => `${prefix}-0001`),
}))
vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { next: () => Promise.resolve(42) },
}));
vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: vi.fn(async (_m: string, base: string) => base.toLowerCase()),
}))

import {
  issueWithholdingCertificate,
  settleWithholdingTax,
} from "@/lib/services/withholding-certificate.service"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.claimIdempotencyKey.mockResolvedValue({ replayed: false })
  mocks.bindIdempotencyKey.mockResolvedValue(undefined)
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.queryRaw.mockResolvedValue([{ id: 1 }])
  mocks.certFindFirst.mockResolvedValue(null)
  mocks.certCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 7, ...data }),
  )
  mocks.typeFindUniqueOrThrow.mockResolvedValue({
    id: 3, code: "PPh23-JASA", article: "PPh23", objectCode: "24-104-01",
    rate: 2, liabilityAccountId: 501, receivableAccountId: 502,
  })
  // Katalog sewa dari master aktif (baris PPH42-SEWA*): hanya 28-403-02.
  mocks.typeFindMany.mockResolvedValue([
    { code: "PPH42-SEWA", objectCode: "28-403-02", rate: 10 },
  ])
  mocks.accountFindMany.mockResolvedValue([{ id: 501 }, { id: 102 }])
  mocks.taxPaymentCreate.mockResolvedValue({ id: 9 })
  mocks.taxPaymentUpdate.mockResolvedValue({})
  mocks.journalCreate.mockResolvedValue({ id: 11 })
})

function key() {
  return `test-key-${Math.random().toString(36).slice(2, 10)}-ab`
}

describe("issueWithholdingCertificate guards", () => {
  it("snapshot pasal+kode+tarif+DPP dari master saat terbit", async () => {
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-001",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(true)
    const data = mocks.certCreate.mock.calls[0][0].data
    expect(data.article).toBe("PPh23")
    expect(data.objectCode).toBe("24-104-01")
    expect(data.objectName).toBeNull()
    expect(Number(data.tariff)).toBe(2)
    expect(Number(data.withheldAmount)).toBe(200_000)
    expect(data.taxPeriod).toBe("2026-01")
  })

  it("fail-closed: we_withhold tanpa akun Hutang PPh ditolak", async () => {
    mocks.typeFindUniqueOrThrow.mockResolvedValue({
      id: 3, code: "PPh23-JASA", article: "PPh23", objectCode: "24-104-01",
      rate: 2, liabilityAccountId: null, receivableAccountId: 502,
    })
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-002",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/Hutang PPh/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("duplikat nomor bupot ditolak definitif", async () => {
    mocks.certFindFirst.mockResolvedValue({ id: 9 })
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-001",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(r.ambiguous).toBe(false)
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("jenis tanpa pasal snapshot ditolak (jangan tebak pasal)", async () => {
    mocks.typeFindUniqueOrThrow.mockResolvedValue({
      id: 3, code: "LAMA", article: null, objectCode: null,
      rate: 2, liabilityAccountId: 501, receivableAccountId: 502,
    })
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-003",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/tidak dikenal/)
  })
})

describe("issueWithholdingCertificate PPH42-SEWA fail-closed (F47-1)", () => {
  const sewaType = {
    id: 4, code: "PPH42-SEWA", article: "PPh4(2)", objectCode: "28-403-02",
    rate: 10, liabilityAccountId: 503, receivableAccountId: null,
  }

  it("master 28-403-02: bruto 100jt -> potong 10jt (Cr 210206 via liability), snapshot kode beku", async () => {
    mocks.typeFindUniqueOrThrow.mockResolvedValue(sewaType)
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-SEWA-1",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Properti",
      withholdingTypeId: 4, dpp: 100_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(true)
    const data = mocks.certCreate.mock.calls[0][0].data
    expect(data.objectCode).toBe("28-403-02")
    expect(data.objectName).toBe("Persewaan Tanah dan/atau Bangunan")
    expect(data.rentObjectEvidence).toBeNull()
    expect(Number(data.tariff)).toBe(10)
    expect(Number(data.withheldAmount)).toBe(10_000_000)
    expect(Number(data.dpp) - Number(data.withheldAmount)).toBe(90_000_000)
  })

  it("tanpa kode objek master = gagal terbit di level service, certCreate tak dipanggil", async () => {
    mocks.typeFindUniqueOrThrow.mockResolvedValue({ ...sewaType, objectCode: null })
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-SEWA-2",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Properti",
      withholdingTypeId: 4, dpp: 100_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(r.ambiguous).toBe(false)
    expect(String(r.error)).toMatch(/kode objek wajib/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("kode konstruksi 28-409-xx di master = ditolak service", async () => {
    mocks.typeFindUniqueOrThrow.mockResolvedValue({ ...sewaType, objectCode: "28-409-01" })
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-SEWA-3",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Properti",
      withholdingTypeId: 4, dpp: 100_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/konstruksi/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("F51-2: kode master di luar katalog aktif (28-403-99) = ditolak, certCreate tak dipanggil", async () => {
    mocks.typeFindUniqueOrThrow.mockResolvedValue({ ...sewaType, objectCode: "28-403-99" })
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-SEWA-4",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Properti",
      withholdingTypeId: 4, dpp: 100_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(r.ambiguous).toBe(false)
    expect(String(r.error)).toMatch(/di luar katalog/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
    // Katalog HARUS dibaca hanya dari baris master aktif keluarga sewa.
    const where = mocks.typeFindMany.mock.calls[0][0].where
    expect(where).toEqual({ code: { startsWith: "PPH42-SEWA" }, isActive: true, deletedAt: null })
  })

  it("F51-6: tarif master sewa menyimpang (5) = ditolak service", async () => {
    mocks.typeFindUniqueOrThrow.mockResolvedValue({ ...sewaType, rate: 5 })
    mocks.typeFindMany.mockResolvedValue([{ code: "PPH42-SEWA", objectCode: "28-403-02", rate: 5 }])
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-SEWA-5",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Properti",
      withholdingTypeId: 4, dpp: 100_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/menyimpang/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("F51-3+F55-V §1: jenis PPH42-SEWA-PP (28-403-04) tanpa bukti/format bebas ditolak; bukti terstruktur terbit 10% + snapshot persists", async () => {
    mocks.typeFindUniqueOrThrow.mockResolvedValue({
      ...sewaType, id: 5, code: "PPH42-SEWA-PP", objectCode: "28-403-04",
    })
    mocks.typeFindMany.mockResolvedValue([
      { code: "PPH42-SEWA", objectCode: "28-403-02", rate: 10 },
      { code: "PPH42-SEWA-PP", objectCode: "28-403-04", rate: 10 },
    ])
    const tanpa = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-SEWA-6",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Properti",
      withholdingTypeId: 5, dpp: 100_000_000, idempotencyKey: key(),
    })
    expect(tanpa.success).toBe(false)
    expect(mocks.certCreate).not.toHaveBeenCalled()

    const bebas = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-SEWA-7",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Properti",
      withholdingTypeId: 5, dpp: 100_000_000, idempotencyKey: key(),
      rentObjectEvidence: "Kontrak proyek pemerintah No. 12/2026",
    })
    expect(bebas.success).toBe(false)
    expect(String(bebas.error)).toMatch(/wajib format/)
    expect(mocks.certCreate).not.toHaveBeenCalled()

    const bukti = "Kontrak | 12/2026 | 2026-01-05 | Kementerian X | https://contoh/dok"
    const dengan = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-SEWA-8",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Properti",
      withholdingTypeId: 5, dpp: 100_000_000, idempotencyKey: key(),
      rentObjectEvidence: bukti,
    })
    expect(dengan.success).toBe(true)
    const data = mocks.certCreate.mock.calls[0][0].data
    expect(data.objectCode).toBe("28-403-04")
    expect(data.objectName).toContain("Proyek Pemerintah")
    expect(data.rentObjectEvidence).toBe(bukti)
    expect(Number(data.withheldAmount)).toBe(10_000_000)
  })
})

describe("settleWithholdingTax", () => {
  it("scope settle terpisah + bind ref TaxPayment + jurnal Dr utang / Cr kas", async () => {
    const r = await settleWithholdingTax({
      withholdingTypeId: 3, period: "2026-01", paymentAccountId: 102,
      amount: 200_000, billingCode: "123456789012345", ntpn: "1234567890123456",
      idempotencyKey: key(),
    })
    expect(r.success).toBe(true)
    const claim = mocks.claimIdempotencyKey.mock.calls[0]
    expect(claim[1]).toBe("withholding_settle")
    expect(mocks.bindIdempotencyKey).toHaveBeenCalledWith(
      expect.anything(), expect.any(String), "TaxPayment", 9,
    )
    const payment = mocks.taxPaymentCreate.mock.calls[0][0].data
    expect(payment.billingCode).toBe("123456789012345")
    expect(payment.ntpn).toBe("1234567890123456")
    expect(payment.taxKind).toBe("pph23")
    // Akun utang default dari liabilityAccountId jenis (fail-closed).
    expect(payment.taxAccountId).toBe(501)
    const journal = mocks.journalCreate.mock.calls[0][0].data
    expect(journal.entries.create[0].accountId).toBe(501)
    expect(Number(journal.entries.create[0].debit)).toBe(200_000)
    expect(journal.entries.create[1].accountId).toBe(102)
  })

  it("billing bukan 15 digit ditolak sebelum DB", async () => {
    const r = await settleWithholdingTax({
      withholdingTypeId: 3, period: "2026-01", paymentAccountId: 102,
      amount: 200_000, billingCode: "123", idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/15 digit/)
    expect(mocks.taxPaymentCreate).not.toHaveBeenCalled()
  })
})
