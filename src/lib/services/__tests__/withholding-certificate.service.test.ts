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
  const executeRaw = vi.fn()

  const systemSettingFindFirst = vi.fn()
  const billFindUnique = vi.fn(async () => ({
    id: 42, status: "posted", deletedAt: null,
    withholdingAmount: 200_000, withholdingTypeId: 3, documentNo: "VB-001",
  }))
  const paymentFindUnique = vi.fn(async () => ({
    id: 88, status: "posted", withholdingAmount: 200_000, withholdingTypeId: 3,
  }))
  const tx: Record<string, unknown> = {
    withholdingCertificate: {
      findFirst: certFindFirst,
      create: certCreate,
      findUniqueOrThrow: certFindUniqueOrThrow,
      update: certUpdate,
    },
    vendorBill: { findUnique: billFindUnique },
    salesPayment: { findUnique: paymentFindUnique },
    withholdingTaxType: { findUniqueOrThrow: typeFindUniqueOrThrow, findMany: typeFindMany },
    account: { findMany: accountFindMany },
    taxPayment: { findFirst: vi.fn(async () => null), create: taxPaymentCreate, update: taxPaymentUpdate },
    journal: { findFirst: vi.fn(async () => null), create: journalCreate },
    systemSetting: { findFirst: systemSettingFindFirst },
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
  }
  const prisma = {
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  }
  return {
    certFindFirst, certCreate, certFindUniqueOrThrow, certUpdate,
    typeFindUniqueOrThrow, typeFindMany, accountFindMany, taxPaymentCreate, taxPaymentUpdate,
    journalCreate, claimIdempotencyKey, bindIdempotencyKey, assertPeriodOpen,
    reverseJournals, queryRaw, executeRaw, prisma, systemSettingFindFirst,
    billFindUnique, paymentFindUnique,
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
  revokeWithholdingCertificate,
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
  // Kontrak gerbang putaran 35: akun dinilai hidup/tipe dalam tx — default
  // dua baris sehat (501 utang pajak LIABILITY; 102 kas-bank BANK).
  mocks.accountFindMany.mockImplementation(async (arg: { where?: { id?: { in?: number[] } } }) => {
    const ids = arg?.where?.id?.in ?? [501, 102]
    const kind = (id: number) =>
      id === 501 ? { type: "LIABILITY", reportGroup: "LIABILITY" }
      : id === 102 ? { type: "ASSET", reportGroup: "BANK" }
      : id === 210 ? { type: "LIABILITY", reportGroup: "LIABILITY" }
      : id === 110 ? { type: "ASSET", reportGroup: "RECEIVABLE" }
      : { type: "ASSET", reportGroup: "BANK" }
    return ids.map((id) => ({ id, isActive: true, deletedAt: null, ...kind(id) }))
  })
  mocks.taxPaymentCreate.mockResolvedValue({ id: 9 })
  mocks.taxPaymentUpdate.mockResolvedValue({})
  mocks.journalCreate.mockResolvedValue({ id: 11 })
  mocks.systemSettingFindFirst.mockResolvedValue({
    purchasePayableAccountId: 210,
    salesReceivableAccountId: 110,
  })
  mocks.certUpdate.mockResolvedValue({})
  mocks.executeRaw.mockResolvedValue(1)
  // Default dokumen sumber DENGAN potongan tercatat (kaki jurnal sumber
  // ada) — revoke ber-jurnal adalah kasus normal; kasus tanpa kaki sumber
  // ditimpa eksplisit per test di describe putaran 22.
  mocks.billFindUnique.mockResolvedValue({
    id: 42, status: "posted", deletedAt: null,
    withholdingAmount: 200_000, withholdingTypeId: 3, documentNo: "VB-001",
  })
  mocks.paymentFindUnique.mockResolvedValue({
    id: 88, status: "posted", withholdingAmount: 200_000, withholdingTypeId: 3,
  })
})

function key() {
  return `test-key-${Math.random().toString(36).slice(2, 10)}-ab`
}

// regresi putaran 35: akun setor/revoke bupot dinilai hidup + grup di dalam tx
describe("gerbang akun setor/revoke bupot (putaran 35)", () => {
  const baseCert = {
    id: 16,
    status: "issued",
    direction: "we_withhold",
    certificateNumber: "BP-001",
    withholdingDate: new Date(2026, 0, 10),
    withholdingTypeId: 3,
    withheldAmount: 200_000,
    vendorBillId: 42,
    salesPaymentId: null,
  }

  it("settle menolak akun utang pajak nonaktif", async () => {
    mocks.accountFindMany.mockResolvedValue([
      { id: 501, isActive: false, deletedAt: null, type: "LIABILITY", reportGroup: "LIABILITY" },
      { id: 102, isActive: true, deletedAt: null, type: "ASSET", reportGroup: "BANK" },
    ])
    const r = await settleWithholdingTax({
      withholdingTypeId: 3, period: "2026-01", paymentAccountId: 102,
      amount: 200_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/tidak aktif/)
    expect(mocks.taxPaymentCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("settle menolak akun bayar bukan grup BANK", async () => {
    mocks.accountFindMany.mockResolvedValue([
      { id: 501, isActive: true, deletedAt: null, type: "LIABILITY", reportGroup: "LIABILITY" },
      { id: 102, isActive: true, deletedAt: null, type: "EXPENSE", reportGroup: "EXPENSE" },
    ])
    const r = await settleWithholdingTax({
      withholdingTypeId: 3, period: "2026-01", paymentAccountId: 102,
      amount: 200_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/kas\/bank/)
    expect(mocks.taxPaymentCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("revoke menolak akun hutang PPh terhapus (jurnal lawan tak ditulis)", async () => {
    mocks.certFindUniqueOrThrow.mockResolvedValue(baseCert)
    mocks.accountFindMany.mockResolvedValue([
      { id: 501, isActive: true, deletedAt: new Date(2026, 0, 5), type: "LIABILITY", reportGroup: "LIABILITY" },
      { id: 210, isActive: true, deletedAt: null, type: "LIABILITY", reportGroup: "LIABILITY" },
    ])
    const r = await revokeWithholdingCertificate({ id: 16, idempotencyKey: key(), userId: 5 })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/dihapus/)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.certUpdate).not.toHaveBeenCalled()
  })
})

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

  it("bupot kedua atas bill sama ditolak — satu dokumen satu bupot aktif", async () => {
    mocks.certFindFirst
      .mockResolvedValueOnce(null) // nomor bupot baru belum ada
      .mockResolvedValueOnce({ id: 9, certificateNumber: "BP-LAMA" }) // bill sudah berbupot
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-BARU",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000, vendorBillId: 42, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/sudah punya bupot aktif/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("bupot atas bill yang belum terposting ditolak — daftar diakui hanya posted/partial/paid", async () => {
    mocks.billFindUnique.mockResolvedValue({
      id: 42, status: "draft", deletedAt: null,
      withholdingAmount: 0, withholdingTypeId: 3, documentNo: "VB-DRAFT",
    })
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-DRAFT",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000, vendorBillId: 42, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/belum terposting/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("arah tak cocok dokumen tertaut ditolak (bill + withheld_from_us)", async () => {
    const r = await issueWithholdingCertificate({
      direction: "withheld_from_us", certificateNumber: "BP-X",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000, vendorBillId: 42, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/we_withhold/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("baris dokumen sumber dikunci FOR UPDATE sebelum cek bupot aktif", async () => {
    // Dua terbit key berbeda atas bill sama: kunci vendor_bills
    // menserialkan sehingga cek bupot aktif yang kalah melihat bupot
    // pemenang. Tanpa kunci dua bupot aktif lahir untuk satu bill.
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-LOCK",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000, vendorBillId: 42, idempotencyKey: key(),
    })
    expect(r.success).toBe(true)
    const lockSqls = mocks.executeRaw.mock.calls.map((c: unknown[]) => {
      const first = c[0] as { strings?: string[] } | string[] | undefined
      if (Array.isArray(first)) return first.join("?")
      return (first as { strings?: string[] } | undefined)?.strings?.join("?") ?? ""
    })
    expect(lockSqls.some((s: string) => s.includes("vendor_bills") && s.includes("FOR UPDATE"))).toBe(true)
    expect(mocks.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.billFindUnique.mock.invocationCallOrder[0],
    )
  })

  it("regresi putaran 48: bupot atas bill — DPP x tarif wajib cocok dengan potongan tercatat bill", async () => {
    // Bill tercatat berpotongan 200_000 (2% x 10jt); bupot diajukan atas DPP
    // 5jt -> potong 100_000. Tanpa pencocokan, bukti potong ke DJP tidak sama
    // dengan kaki potongan di GL dan revoke nanti melahirkan jurnal lawan
    // sebesar snapshot bupot (miring dari jurnal sumber).
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-MISMATCH",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 5_000_000, vendorBillId: 42, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/tidak cocok/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("regresi putaran 48: bupot atas pembayaran — jenis PPh wajib cocok dengan jenis tercatat", async () => {
    mocks.typeFindUniqueOrThrow.mockResolvedValue({
      id: 3, code: "PPh23-JASA", article: "PPh23", objectCode: "24-104-01",
      rate: 2, liabilityAccountId: 501, receivableAccountId: 502,
    })
    mocks.paymentFindUnique.mockResolvedValue({
      id: 88, status: "posted", withholdingAmount: 200_000, withholdingTypeId: 99,
    })
    const r = await issueWithholdingCertificate({
      direction: "withheld_from_us", certificateNumber: "BP-TIPE",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Langganan",
      withholdingTypeId: 3, dpp: 10_000_000, salesPaymentId: 88, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/tidak cocok/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("bupot atas pembayaran yang sudah dibalik ditolak", async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      id: 88, status: "reversed", withholdingAmount: 200_000, withholdingTypeId: 3,
    })
    const r = await issueWithholdingCertificate({
      direction: "withheld_from_us", certificateNumber: "BP-Y",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Langganan",
      withholdingTypeId: 3, dpp: 10_000_000, salesPaymentId: 88, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/sudah dibalik/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
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

  it("regresi putaran 48: baris jenis PPh dikunci FOR UPDATE sebelum dibaca saat terbit", async () => {
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-LOCKTYPE",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(true)
    const lockIdx = mocks.executeRaw.mock.calls.findIndex((c: unknown[]) => {
      const first = c[0] as { strings?: string[] } | string[] | undefined
      const sql = Array.isArray(first) ? first.join("?") : (first as { strings?: string[] } | undefined)?.strings?.join("?") ?? ""
      return sql.includes("withholding_tax_types") && sql.includes("FOR UPDATE")
    })
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    expect(mocks.executeRaw.mock.invocationCallOrder[lockIdx]).toBeLessThan(
      mocks.typeFindUniqueOrThrow.mock.invocationCallOrder[0],
    )
  })

  it("R8-PAJAK-03: fasilitas SKB/PP23/DTP → potong 0, tarif snapshot tetap nominal", async () => {
    for (const facility of ["SKB", "PP23", "DTP"] as const) {
      vi.clearAllMocks()
      mocks.claimIdempotencyKey.mockResolvedValue({ replayed: false })
      mocks.bindIdempotencyKey.mockResolvedValue(undefined)
      mocks.assertPeriodOpen.mockResolvedValue(undefined)
      mocks.queryRaw.mockResolvedValue([{ id: 1 }])
      mocks.certFindFirst.mockResolvedValue(null)
      mocks.typeFindUniqueOrThrow.mockResolvedValue({
        id: 3, code: "PPh23-JASA", article: "PPh23", objectCode: "24-104-01",
        rate: 2, liabilityAccountId: 501, receivableAccountId: 502,
      })
      mocks.certCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 5, ...data }),
      )
      const r = await issueWithholdingCertificate({
        direction: "we_withhold", certificateNumber: `BP-${facility}`,
        withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
        withholdingTypeId: 3, dpp: 100_000_000, facility, facilityNumber: "SKB-1",
        idempotencyKey: key(),
      })
      expect(r.success).toBe(true)
      const data = mocks.certCreate.mock.calls[0][0].data
      expect(Number(data.withheldAmount)).toBe(0)
      expect(Number(data.tariff)).toBe(2)
      expect(data.facility).toBe(facility)
    }
  })

  it("R8-PAJAK-03: fasilitas tak dikenal ditolak definitif", async () => {
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-X",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000,
      facility: "XYZ" as never, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/tidak dikenal/)
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("R8-PAJAK-08: jenis nonaktif/terhapus ditolak terbit", async () => {
    for (const patch of [{ isActive: false }, { deletedAt: new Date() }]) {
      mocks.typeFindUniqueOrThrow.mockResolvedValue({
        id: 3, code: "PPh23-JASA", article: "PPh23", objectCode: "24-104-01",
        rate: 2, liabilityAccountId: 501, receivableAccountId: 502,
        isActive: true, deletedAt: null, ...patch,
      })
      const r = await issueWithholdingCertificate({
        direction: "we_withhold", certificateNumber: "BP-NA",
        withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
        withholdingTypeId: 3, dpp: 10_000_000, idempotencyKey: key(),
      })
      expect(r.success).toBe(false)
      expect(String(r.error)).toMatch(/nonaktif|sudah dihapus/)
    }
    expect(mocks.certCreate).not.toHaveBeenCalled()
  })

  it("R8-PAJAK-08: jenis nonaktif ditolak settle", async () => {
    mocks.typeFindUniqueOrThrow.mockResolvedValue({
      id: 3, code: "PPh23-JASA", article: "PPh23", objectCode: "24-104-01",
      rate: 2, liabilityAccountId: 501, receivableAccountId: 502,
      isActive: false, deletedAt: null,
    })
    const r = await settleWithholdingTax({
      withholdingTypeId: 3, period: "2026-01", paymentAccountId: 102,
      amount: 200_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/nonaktif/)
    expect(mocks.taxPaymentCreate).not.toHaveBeenCalled()
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

  it("race nomor bupot: P2002 uq_withholding_certificates_number diterjemahkan definitif", async () => {
    mocks.certCreate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: "uq_withholding_certificates_number" },
      }),
    )
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-001",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(r.ambiguous).toBe(false)
    expect(String(r.error)).toMatch(/Nomor bupot "BP-001" sudah terbit/)
  })

  it("P2002 constraint lain (slug) tetap ambiguous", async () => {
    mocks.certCreate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: "withholding_certificates_slug_unique" },
      }),
    )
    const r = await issueWithholdingCertificate({
      direction: "we_withhold", certificateNumber: "BP-001",
      withholdingDate: new Date(2026, 0, 10), counterpartyName: "PT Maklon",
      withholdingTypeId: 3, dpp: 10_000_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(r.ambiguous).toBe(true)
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

describe("revokeWithholdingCertificate tanpa kaki sumber (putaran 22)", () => {
  it("bupot tanpa tautan direvoke tanpa jurnal lawan (register saja dibatalkan)", async () => {
    mocks.certFindUniqueOrThrow.mockResolvedValue({
      id: 16, status: "issued", direction: "we_withhold", certificateNumber: "BP-YATIM",
      withholdingDate: new Date(2026, 0, 10), withholdingTypeId: 3, withheldAmount: 200_000,
      vendorBillId: null, salesPaymentId: null,
    })
    const r = await revokeWithholdingCertificate({ id: 16, idempotencyKey: key(), userId: 5 })
    expect(r.success).toBe(true)
    expect(mocks.certUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "revoked" }) }),
    )
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("regresi putaran 48: bupot fasilitas potongan nol (SKB) bisa direvoke register-saja", async () => {
    mocks.certFindUniqueOrThrow.mockResolvedValue({
      id: 16, status: "issued", direction: "we_withhold", certificateNumber: "BP-SKB",
      withholdingDate: new Date(2026, 0, 10), withholdingTypeId: 3, withheldAmount: 0,
      vendorBillId: null, salesPaymentId: null, facility: "SKB",
    })
    const r = await revokeWithholdingCertificate({ id: 16, idempotencyKey: key(), userId: 5 })
    expect(r.success).toBe(true)
    expect(mocks.certUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "revoked" }) }),
    )
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("bupot tertaut beban tunai (sumber tanpa potongan tercatat) direvoke tanpa jurnal lawan", async () => {
    mocks.certFindUniqueOrThrow.mockResolvedValue({
      id: 16, status: "issued", direction: "we_withhold", certificateNumber: "BP-CASH",
      withholdingDate: new Date(2026, 0, 10), withholdingTypeId: 3, withheldAmount: 200_000,
      vendorBillId: 42, salesPaymentId: null,
    })
    mocks.billFindUnique.mockResolvedValue({
      id: 42, status: "posted", deletedAt: null,
      withholdingAmount: 0, withholdingTypeId: null as unknown as number, documentNo: "VB-CASH-1",
    })
    const r = await revokeWithholdingCertificate({ id: 16, idempotencyKey: key(), userId: 5 })
    expect(r.success).toBe(true)
    expect(mocks.certUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "revoked" }) }),
    )
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("regresi putaran 48: revoke ditolak bila nominal bupot != potongan tercatat bill (mismatch warisan)", async () => {
    mocks.certFindUniqueOrThrow.mockResolvedValue({
      id: 16, status: "issued", direction: "we_withhold", certificateNumber: "BP-WARISAN",
      withholdingDate: new Date(2026, 0, 10), withholdingTypeId: 3, withheldAmount: 150_000,
      vendorBillId: 42, salesPaymentId: null,
    })
    const r = await revokeWithholdingCertificate({ id: 16, idempotencyKey: key(), userId: 5 })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/tidak cocok/)
    expect(mocks.certUpdate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("regresi putaran 48: revoke ditolak bila nominal bupot != potongan tercatat pembayaran", async () => {
    mocks.certFindUniqueOrThrow.mockResolvedValue({
      id: 16, status: "issued", direction: "withheld_from_us", certificateNumber: "BP-WARISAN2",
      withholdingDate: new Date(2026, 0, 10), withholdingTypeId: 3, withheldAmount: 150_000,
      vendorBillId: null, salesPaymentId: 88,
    })
    const r = await revokeWithholdingCertificate({ id: 16, idempotencyKey: key(), userId: 5 })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/tidak cocok/)
    expect(mocks.certUpdate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("bupot atas bill dengan potongan tanpa baris TaxInvoice tetap direvoke dengan jurnal lawan", async () => {
    mocks.certFindUniqueOrThrow.mockResolvedValue({
      id: 16, status: "issued", direction: "we_withhold", certificateNumber: "BP-OK",
      withholdingDate: new Date(2026, 0, 10), withholdingTypeId: 3, withheldAmount: 200_000,
      vendorBillId: 42, salesPaymentId: null,
    })
    mocks.billFindUnique.mockResolvedValue({
      id: 42, status: "posted", deletedAt: null,
      withholdingAmount: 200_000, withholdingTypeId: 3, documentNo: "VB-OK-1",
    })
    const r = await revokeWithholdingCertificate({ id: 16, idempotencyKey: key(), userId: 5 })
    expect(r.success).toBe(true)
    expect(mocks.journalCreate).toHaveBeenCalledTimes(1)
    const journal = mocks.journalCreate.mock.calls[0][0].data
    expect(journal.referenceType).toBe("WithholdingCertificate")
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

describe("revokeWithholdingCertificate (round3 #2)", () => {
  const baseCert = {
    id: 16,
    status: "issued",
    direction: "we_withhold",
    certificateNumber: "BP-001",
    withholdingDate: new Date(2026, 0, 10),
    withholdingTypeId: 3,
    withheldAmount: 200_000,
    vendorBillId: 42,
    salesPaymentId: null,
  }

  it("we_withhold: hanya balik efek potongan (Dr Hutang PPh / Cr Hutang Usaha), jurnal VendorBill utuh", async () => {
    mocks.certFindUniqueOrThrow.mockResolvedValue(baseCert)
    const r = await revokeWithholdingCertificate({ id: 16, idempotencyKey: key(), userId: 5 })
    expect(r.success).toBe(true)
    // Regresi bug lama: TIDAK ada reversal jurnal dokumen sumber sama sekali.
    expect(mocks.reverseJournals).not.toHaveBeenCalled()
    expect(mocks.certUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "revoked" }) }),
    )
    expect(mocks.journalCreate).toHaveBeenCalledTimes(1)
    const journal = mocks.journalCreate.mock.calls[0][0].data
    expect(journal.referenceType).toBe("WithholdingCertificate")
    expect(journal.referenceId).toBe(16)
    expect(journal.status).toBe("POSTED")
    expect(Number(journal.totalDebit)).toBe(200_000)
    expect(Number(journal.totalCredit)).toBe(200_000)
    const entries = journal.entries.create as { accountId: number; debit: unknown; credit: unknown }[]
    expect(entries).toHaveLength(2)
    // liabilityAccountId jenis = 501 di fixture master.
    expect(entries[0].accountId).toBe(501)
    expect(Number(entries[0].debit)).toBe(200_000)
    expect(entries[1].accountId).toBe(210)
    expect(Number(entries[1].credit)).toBe(200_000)
  })

  it("withheld_from_us: Dr Piutang / Cr PPh dibayar dimuka, jurnal SalesPayment utuh", async () => {
    mocks.certFindUniqueOrThrow.mockResolvedValue({
      ...baseCert,
      direction: "withheld_from_us",
      vendorBillId: null,
      salesPaymentId: 88,
    })
    const r = await revokeWithholdingCertificate({ id: 16, idempotencyKey: key(), userId: 5 })
    expect(r.success).toBe(true)
    expect(mocks.reverseJournals).not.toHaveBeenCalled()
    const journal = mocks.journalCreate.mock.calls[0][0].data
    expect(journal.referenceType).toBe("WithholdingCertificate")
    const entries = journal.entries.create as { accountId: number; debit: unknown; credit: unknown }[]
    // receivableAccountId jenis = 502; lawan Piutang Usaha setting = 110.
    expect(entries[0].accountId).toBe(110)
    expect(Number(entries[0].debit)).toBe(200_000)
    expect(entries[1].accountId).toBe(502)
    expect(Number(entries[1].credit)).toBe(200_000)
  })

  it("bupot sudah revoked ditolak definitif, nol jurnal baru", async () => {
    mocks.certFindUniqueOrThrow.mockResolvedValue({ ...baseCert, status: "revoked" })
    const r = await revokeWithholdingCertificate({ id: 16, idempotencyKey: key() })
    expect(r.success).toBe(false)
    expect(r.ambiguous).toBe(false)
    expect(String(r.error)).toMatch(/sudah revoked/)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.certUpdate).not.toHaveBeenCalled()
  })

  it("fail-closed: jenis we_withhold tanpa akun Hutang PPh -> tolak sebelum mutasi", async () => {
    mocks.certFindUniqueOrThrow.mockResolvedValue(baseCert)
    mocks.typeFindUniqueOrThrow.mockResolvedValue({
      id: 3, code: "PPh23-JASA", article: "PPh23", objectCode: "24-104-01",
      rate: 2, liabilityAccountId: null, receivableAccountId: 502,
    })
    const r = await revokeWithholdingCertificate({ id: 16, idempotencyKey: key() })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/Hutang PPh/)
    expect(mocks.certUpdate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
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

  it("settle menolak jenis yang dinonaktifkan sesudah baca awal — kunci baris jenis (putaran 22)", async () => {
    mocks.typeFindUniqueOrThrow.mockResolvedValueOnce({
      id: 3, code: "PPh23-JASA", article: "PPh23", objectCode: "24-104-01",
      rate: 2, liabilityAccountId: 501, receivableAccountId: 502,
      isActive: false, deletedAt: null,
    })
    const r = await settleWithholdingTax({
      withholdingTypeId: 3, period: "2026-01", paymentAccountId: 102,
      amount: 200_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/nonaktif/)
    const lockSqls = mocks.executeRaw.mock.calls.map((c: unknown[]) => {
      const first = c[0] as { strings?: string[] } | string[] | undefined
      if (Array.isArray(first)) return first.join("?")
      return (first as { strings?: string[] } | undefined)?.strings?.join("?") ?? ""
    })
    expect(lockSqls.some((s: string) => s.includes("withholding_tax_types") && s.includes("FOR UPDATE"))).toBe(true)
    expect(mocks.executeRaw.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.typeFindUniqueOrThrow.mock.invocationCallOrder[0],
    )
    expect(mocks.taxPaymentCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("tanggal setor masa 2026-11 = tengah malam UTC 1 Nov (bukan 31 Okt lokal)", async () => {
    const r = await settleWithholdingTax({
      withholdingTypeId: 3, period: "2026-11", paymentAccountId: 102,
      amount: 200_000, idempotencyKey: key(),
    })
    expect(r.success).toBe(true)
    const payment = mocks.taxPaymentCreate.mock.calls[0][0].data
    expect((payment.date as Date).toISOString()).toBe("2026-11-01T00:00:00.000Z")
    const journal = mocks.journalCreate.mock.calls[0][0].data
    expect((journal.transactionDate as Date).toISOString()).toBe("2026-11-01T00:00:00.000Z")
  })
})
