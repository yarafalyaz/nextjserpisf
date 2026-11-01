import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"
import { POST } from "../route"

const mocks = vi.hoisted(() => ({
  isValidCron: vi.fn(),
  assetFindMany: vi.fn(),
  journalFindMany: vi.fn(),
  journalFindFirst: vi.fn(),
  txQueryRaw: vi.fn(),
  assetUpdate: vi.fn(),
  assetHistoryCreate: vi.fn(),
  journalCreate: vi.fn(),
  transaction: vi.fn(),
  computeMonthlyDepreciation: vi.fn(),
  isRegisteredDepreciationMethod: vi.fn(),
  isAnalyticalDepreciationMethod: vi.fn(),
  docSeqNextBatch: vi.fn(),
  systemSettingFindFirst: vi.fn(),
  assertPeriodOpen: vi.fn(),
  assetUsageRecordFindFirst: vi.fn(),
  assetFindUniqueTx: vi.fn(),
  journalFindManyTx: vi.fn(),
}))

vi.mock("@/lib/security/cron", () => ({
  isValidCronRequest: (...a: unknown[]) => mocks.isValidCron(...a),
}))

vi.mock("@/lib/finance/asset-depreciation", () => ({
  computeMonthlyDepreciation: (...a: unknown[]) => mocks.computeMonthlyDepreciation(...a),
  isRegisteredDepreciationMethod: (...a: unknown[]) => mocks.isRegisteredDepreciationMethod(...a),
  isAnalyticalDepreciationMethod: (...a: unknown[]) => mocks.isAnalyticalDepreciationMethod(...a),
}))

vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: {
    nextBatch: (...a: unknown[]) => mocks.docSeqNextBatch(...a),
    next: vi.fn(),
    peek: vi.fn(),
    reset: vi.fn(),
    listByPrefix: vi.fn(),
  },
}))

vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => mocks.assertPeriodOpen(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    asset: {
      findMany: (...a: unknown[]) => mocks.assetFindMany(...a),
      update: (...a: unknown[]) => mocks.assetUpdate(...a),
    },
    assetHistory: {
      create: (...a: unknown[]) => mocks.assetHistoryCreate(...a),
    },
    journal: {
      findMany: (...a: unknown[]) => mocks.journalFindMany(...a),
      create: (...a: unknown[]) => mocks.journalCreate(...a),
    },
    systemSetting: { findFirst: (...a: unknown[]) => mocks.systemSettingFindFirst(...a) },
    // Route memanggil $transaction SATU kali dengan callback yang diisi
    // Promise.allSettled di dalam rute (bukan array operasi).
    $transaction: (...a: unknown[]) => mocks.transaction(...a),
    assetUsageRecord: {
      findFirst: (...a: unknown[]) => mocks.assetUsageRecordFindFirst(...a),
    },
  },
}))

vi.spyOn(console, "error").mockImplementation(() => {})

function makeReq(): Request {
  return new Request("http://localhost/api/cron/asset-depreciation", {
    headers: { authorization: "Bearer ***REMOVED***" },
  })
}

const D = (v: number | string) => new Prisma.Decimal(v)

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code: "AST-1",
    name: "Machine",
    currentValue: D(950),
    purchaseCost: D(1000),
    residualValue: D(0),
    depreciationMethod: "straight_line",
    status: "active",
    purchaseDate: new Date(2026, 0, 1),
    totalEstimatedUnits: null,
    usefulLifeMonths: null,
    usageRecords: [],
    category: {
      depreciationRate: D(10),
      usefulLife: 0,
      depreciationExpenseAccountId: 700,
      accumulatedDepreciationAccountId: 701,
      assetAccountId: 900,
    },
    ...overrides,
  }
}

/** Jurnal perolehan POSTED untuk aset 1: Dr Aset Tetap 1000. */
function acquisitionJournals() {
  return [
    {
      referenceType: "ASSET_ACQUISITION",
      referenceId: 1,
      entries: [
        { accountId: 900, debit: D(1000), credit: D(0) },
        { accountId: 999, debit: D(0), credit: D(1000) },
      ],
    },
  ]
}

describe("POST /api/cron/asset-depreciation — vonis F-2026-10-22-062-V", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.DEPRECIATION_EXPENSE_ACCOUNT_ID
    delete process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID
    delete process.env.FIXED_ASSET_ACCOUNT_ID
    mocks.isValidCron.mockReturnValue(true)
    mocks.assetFindMany.mockResolvedValue([])
    // Pemanggilan 1 = jurnal masa ini (idempoten), pemanggilan 2 = semua
    // jurnal POSTED aset (dasar nilai buku).
    mocks.journalFindMany.mockResolvedValue([])
    mocks.systemSettingFindFirst.mockResolvedValue(null)
    mocks.assertPeriodOpen.mockResolvedValue(undefined)
    mocks.isRegisteredDepreciationMethod.mockImplementation(
      (m: string | null | undefined) =>
        ["straight_line", "declining_balance", "units_of_production", "sum_of_years_digits"].includes(m ?? ""),
    )
    mocks.isAnalyticalDepreciationMethod.mockImplementation(
      (m: string | null | undefined) => m === "units_of_production" || m === "sum_of_years_digits",
    )
    mocks.computeMonthlyDepreciation.mockReturnValue({
      status: "computed",
      amount: D(50),
    })
    mocks.docSeqNextBatch.mockImplementation(async (_key: string, count: number) =>
      Array.from({ length: count }, (_, i) => i + 1),
    )
    mocks.journalFindFirst.mockResolvedValue(null)
    mocks.journalCreate.mockResolvedValue({})
    // Bacaan ulang dalam tx (semua metode): default meniru snapshot luar
    // tes lama (aset aktif, jurnal perolehan sama, record per-tes).
    mocks.assetFindUniqueTx.mockResolvedValue({
      status: "active",
      residualValue: D(0),
      totalEstimatedUnits: null,
      usefulLifeMonths: null,
      purchaseDate: new Date(2026, 0, 1),
      currentValue: D(950),
    })
    mocks.journalFindManyTx.mockResolvedValue(acquisitionJournals())
    mocks.assetUsageRecordFindFirst.mockResolvedValue(null)
    mocks.txQueryRaw.mockResolvedValue([{ id: 1 }])
    // Callback tx: jalankan dengan klien palsu yang merekam pemanggilnya.
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: mocks.txQueryRaw,
        asset: {
          update: mocks.assetUpdate,
          findUnique: mocks.assetFindUniqueTx,
        },
        assetHistory: { create: mocks.assetHistoryCreate },
        journal: {
          create: mocks.journalCreate,
          findFirst: mocks.journalFindFirst,
          findMany: mocks.journalFindManyTx,
        },
        assetUsageRecord: { findFirst: mocks.assetUsageRecordFindFirst },
      }),
    )
  })

  it("returns 401 when cron auth invalid", async () => {
    mocks.isValidCron.mockReturnValue(false)
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it("returns 500 on top-level error", async () => {
    mocks.assetFindMany.mockRejectedValue(new Error("db down"))
    const res = await POST(makeReq())
    expect(res.status).toBe(500)
  })

  it("returns 0 processed when no active assets", async () => {
    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(0)
    expect(json.totalAssets).toBe(0)
  })

  it("F62-6: replay bulan sama = nol jurnal baru (dasar idempoten dari jurnal POSTED)", async () => {
    mocks.assetFindMany.mockResolvedValue([assetRow()])
    mocks.journalFindMany
      .mockResolvedValueOnce([{ referenceId: 1 }]) // sudah ada jurnal masa ini
      .mockResolvedValueOnce(acquisitionJournals())

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.skipped).toBe(1)
    expect(json.processed).toBe(0)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.docSeqNextBatch).toHaveBeenCalledWith("JOURNAL", 0)
  })

  it("penjaga POSTED: kedua kueri jurnal menyaring status POSTED + deletedAt null (Putusan 1)", async () => {
    mocks.assetFindMany.mockResolvedValue([assetRow()])
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())

    await POST(makeReq())

    // Falsifikasi kartu t_d34601a0: mock tidak memeriksa argumen where,
    // jadi sabotase POSTED->DRAFT dulu tetap hijau. Assert argumen langsung.
    expect(mocks.journalFindMany).toHaveBeenCalledTimes(2)
    const [idempotentWhere, bookWhere] = mocks.journalFindMany.mock.calls.map(
      (c: unknown[]) => (c[0] as { where: Record<string, unknown> }).where,
    )
    expect(idempotentWhere).toMatchObject({
      status: "POSTED",
      deletedAt: null,
      referenceType: expect.stringMatching(/^ASSET_DEPRECIATION_\d{6}$/),
      referenceId: { in: [1] },
    })
    expect(bookWhere).toMatchObject({
      status: "POSTED",
      deletedAt: null,
      referenceId: { in: [1] },
    })
    expect(bookWhere.OR).toEqual([
      { referenceType: "ASSET_ACQUISITION" },
      { referenceType: "ASSET_DISPOSAL" },
      { referenceType: { startsWith: "ASSET_DEPRECIATION_" } },
      { referenceType: "ASSET_CHANGE_EVENT" },
    ])
  })

  it("aset legacy tanpa jurnal perolehan = error berisik belum berjurnal, nol jurnal", async () => {
    mocks.assetFindMany.mockResolvedValue([assetRow()])
    mocks.journalFindMany.mockResolvedValue([]) // tidak ada jurnal sama sekali

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(0)
    expect(json.notJournaled).toBe(1)
    expect(json.errorDetails[0]).toContain("belum berjurnal")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("F62-3: metode units_of_production ditolak berisik, nol jurnal penyusutan", async () => {
    mocks.assetFindMany.mockResolvedValue([
      assetRow({ depreciationMethod: "units_of_production" }),
    ])
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(0)
    expect(json.rejectedMethods).toBe(1)
    // Isi penolakan analitis (termasuk "totalEstimatedUnits") hanya untuk
    // rejectedMethods pra-tx; r.reason mentah tak lagi disalin ke respons
    // untuk kegagalan DI DALAM tx (lihat kasus periode tertutup di bawah).
    expect(json.errorDetails[0]).toContain("totalEstimatedUnits")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("string metode tak terdaftar ditolak berisik", async () => {
    mocks.assetFindMany.mockResolvedValue([
      assetRow({ depreciationMethod: "metode_ngawur" }),
    ])

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.rejectedMethods).toBe(1)
    expect(json.errorDetails[0]).toContain("tidak terdaftar")
  })

  it("memproses aset berjurnal: dasar dari jurnal, jurnal Decimal, currentValue dari jurnal", async () => {
    mocks.assetFindMany.mockResolvedValue([assetRow()])
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(1)
    expect(mocks.docSeqNextBatch).toHaveBeenCalledWith("JOURNAL", 1)

    // computeMonthlyDepreciation menerima bookValue jurnal (1000), bukan cache.
    const input = mocks.computeMonthlyDepreciation.mock.calls[0][0]
    expect(String(input.bookValue)).toBe("1000")
    expect(String(input.purchaseCost)).toBe("1000")

    const call = mocks.journalCreate.mock.calls[0]?.[0]
    expect(call.data.totalDebit).toBeInstanceOf(Prisma.Decimal)
    expect(call.data.entries.create[0].accountId).toBe(700)
    expect(call.data.entries.create[1].accountId).toBe(701)
    // newBookValue = 1000 − 50 = 950 ditulis ke cache dalam tx yang sama.
    expect(String(mocks.assetUpdate.mock.calls[0][0].data.currentValue)).toBe("950")
    // assertPeriodOpen dipanggil di dalam tx (argumen kedua = tx).
    expect(mocks.assertPeriodOpen.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(mocks.assertPeriodOpen.mock.calls[1][1]).toBeTruthy()
  })

  it("F62-9: periode tertutup menolak di dalam tx — error tercatat, nol jurnal/history/currentValue", async () => {
    mocks.assetFindMany.mockResolvedValue([assetRow()])
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())
    // Fast-fail awal lolos; penjaga di dalam tx menolak.
    mocks.assertPeriodOpen
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Periode sudah ditutup"))

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(0)
    expect(json.errors).toBe(1)
    // Konsistensi error: pesan internal mentah ("Periode sudah ditutup")
    // TIDAK lagi dikirim ke respons; hanya label generik per aset. Detail
    // asli hanya console.error (di-mock senyap di file ini).
    expect(json.errorDetails[0]).toBe("Asset 1 (Machine): gagal diproses")
    expect(json.errorDetails[0]).not.toContain("Periode sudah ditutup")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.assetHistoryCreate).not.toHaveBeenCalled()
    expect(mocks.assetUpdate).not.toHaveBeenCalled()
  })

  it("kunci baris aset FOR UPDATE di dalam tx sebelum cek ulang jurnal masa ini", async () => {
    mocks.assetFindMany.mockResolvedValue([assetRow()])
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(1)
    expect(mocks.txQueryRaw).toHaveBeenCalledTimes(1)
    const strings = mocks.txQueryRaw.mock.calls[0][0] as unknown as string[]
    expect(strings.join(" ")).toContain("FROM assets")
    expect(strings.join(" ")).toContain("FOR UPDATE")
    expect(mocks.txQueryRaw.mock.calls[0][1]).toBe(1)
    // Cek ulang memakai klien tx (bukan baca pra-tx) + filter POSTED.
    expect(mocks.journalFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ referenceId: 1, status: "POSTED", deletedAt: null }),
      }),
    )
  })

  it("jurnal masa ini sudah POSTED saat tx berjalan -> skipped, bukan processed/errors", async () => {
    mocks.assetFindMany.mockResolvedValue([assetRow()])
    // Pra-cek belum melihat jurnal (run lain menang di antara baca & tx),
    // cek ulang di dalam tx (sesudah FOR UPDATE) melihatnya.
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())
    mocks.journalFindFirst.mockResolvedValue({ id: 42 })

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.skipped).toBe(1)
    expect(json.processed).toBe(0)
    expect(json.errors).toBe(0)
    expect(json.errorDetails).toEqual([])
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.assetUpdate).not.toHaveBeenCalled()
    expect(mocks.assetHistoryCreate).not.toHaveBeenCalled()
  })

  it("aset non-UOP yang disposed di jendela scan->tx: dilewati di bawah kunci, nol jurnal/currentValue", async () => {
    mocks.assetFindMany.mockResolvedValue([assetRow()])
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())
    // Baca ulang DI BAWAH kunci: status sudah disposed oleh disposeAsset,
    // dan daftar jurnal segar memuat ASSET_DISPOSAL POSTED.
    mocks.assetFindUniqueTx.mockResolvedValue({
      status: "disposed",
      residualValue: D(0),
      totalEstimatedUnits: null,
      usefulLifeMonths: null,
      purchaseDate: new Date(2026, 0, 1),
      currentValue: D(0),
    })
    mocks.journalFindManyTx.mockResolvedValue([
      ...acquisitionJournals(),
      {
        referenceType: "ASSET_DISPOSAL",
        referenceId: 1,
        entries: [{ accountId: 900, debit: D(0), credit: D(1000) }],
      },
    ])

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(0)
    expect(json.errors).toBe(0)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.assetUpdate).not.toHaveBeenCalled()
    expect(mocks.assetHistoryCreate).not.toHaveBeenCalled()
  })

  it("P2002 dari journal.create diperlakukan skip idempoten, bukan error", async () => {
    mocks.assetFindMany.mockResolvedValue([assetRow()])
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    mocks.journalCreate.mockRejectedValue(p2002)

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.skipped).toBe(1)
    expect(json.processed).toBe(0)
    expect(json.errors).toBe(0)
    expect(JSON.stringify(json.errorDetails)).not.toContain("Unique constraint")
  })

  it("errorDetails respons tidak memuat pesan internal mentah dari kegagalan tx", async () => {
    mocks.assetFindMany.mockResolvedValue([assetRow()])
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())
    mocks.journalCreate.mockRejectedValue(new Error("P2021 tabel journals_internal_secret hilang"))

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.errors).toBe(1)
    expect(json.processed).toBe(0)
    expect(json.errorDetails).toEqual(["Asset 1 (Machine): gagal diproses"])
    expect(JSON.stringify(json)).not.toContain("journals_internal_secret")
  })

  it("missingAccounts berisik bila akun beban/akumulasi tak terpetakan di mana pun", async () => {
    mocks.assetFindMany.mockResolvedValue([
      assetRow({
        category: {
          depreciationRate: D(10),
          usefulLife: 0,
          depreciationExpenseAccountId: null,
          accumulatedDepreciationAccountId: null,
          assetAccountId: 900,
        },
      }),
    ])
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.missingAccounts).toBe(1)
    expect(json.processed).toBe(0)
    expect(json.errorDetails[0]).toContain("belum dipetakan")
  })

  it("limits errorDetails to 10 entries", async () => {
    const assets = Array.from({ length: 12 }, (_, i) =>
      assetRow({ id: i + 1, name: `A${i}`, depreciationMethod: "metode_ngawur" }),
    )
    mocks.assetFindMany.mockResolvedValue(assets)

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.errorDetails.length).toBe(10)
  })

  it("F118-V: UOP lengkap (beku+dokumen) posting jurnal Decimal", async () => {
    mocks.assetFindMany.mockResolvedValue([
      assetRow({
        depreciationMethod: "units_of_production",
        currentValue: D(1000),
        totalEstimatedUnits: D(100),
        usageRecords: [{ actualUnits: D(10) }],
        category: null,
      }),
    ])
    mocks.systemSettingFindFirst.mockResolvedValue({
      depreciationExpenseAccountId: 700,
      accumulatedDepreciationAccountId: 701,
    })
    process.env.FIXED_ASSET_ACCOUNT_ID = "900"
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())
    mocks.assetUsageRecordFindFirst.mockResolvedValue({ actualUnits: D(10) })

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(1)
    expect(json.rejectedMethods).toBe(0)
    const call = mocks.journalCreate.mock.calls[0]?.[0]
    expect(call.data.totalDebit).toBeInstanceOf(Prisma.Decimal)
    expect(String(call.data.totalDebit)).toBe("100")
    expect(String(mocks.assetUpdate.mock.calls[0][0].data.currentValue)).toBe("900")
  })

  it("F118-V: SYD setelah akhir masa skip at-residual, nol jurnal", async () => {
    mocks.assetFindMany.mockResolvedValue([
      assetRow({
        depreciationMethod: "sum_of_years_digits",
        usefulLifeMonths: 1,
        category: null,
      }),
    ])
    mocks.systemSettingFindFirst.mockResolvedValue({
      depreciationExpenseAccountId: 700,
      accumulatedDepreciationAccountId: 701,
    })
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.analyticalSkipped).toBe(1)
    expect(json.processed).toBe(0)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("F118-V: UOP tanpa dokumen masa menolak, tidak menebak unit", async () => {
    mocks.assetFindMany.mockResolvedValue([
      assetRow({
        depreciationMethod: "units_of_production",
        totalEstimatedUnits: D(100),
        category: null,
      }),
    ])
    mocks.systemSettingFindFirst.mockResolvedValue({
      depreciationExpenseAccountId: 700,
      accumulatedDepreciationAccountId: 701,
    })
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(0)
    expect(json.rejectedMethods).toBe(1)
    expect(json.errorDetails[0]).toContain("actualUnits")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("F118-V: UOP memakai unit TERKUNCI dari bacaan ulang dalam tx, bukan snapshot luar", async () => {
    // Snapshot luar tx: 10 unit. Operator mengoreksi record menjadi 50
    // unit dan commit sebelum cron masuk tx. Jurnal wajib memakai 50 —
    // bacaan ulang di bawah kunci baris aset (kunci yang sama dengan
    // upsertAssetUsageRecord).
    mocks.assetFindMany.mockResolvedValue([
      assetRow({
        depreciationMethod: "units_of_production",
        currentValue: D(1000),
        totalEstimatedUnits: D(100),
        usageRecords: [{ actualUnits: D(10) }],
        category: null,
      }),
    ])
    mocks.systemSettingFindFirst.mockResolvedValue({
      depreciationExpenseAccountId: 700,
      accumulatedDepreciationAccountId: 701,
    })
    process.env.FIXED_ASSET_ACCOUNT_ID = "900"
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())
    mocks.assetUsageRecordFindFirst.mockResolvedValue({ actualUnits: D(50) })

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(1)
    expect(mocks.assetUsageRecordFindFirst).toHaveBeenCalled()
    const call = mocks.journalCreate.mock.calls[0]?.[0]
    expect(String(call.data.totalDebit)).toBe("500")
    expect(String(mocks.assetUpdate.mock.calls[0][0].data.currentValue)).toBe("500")
  })

  it("F118-V: analyticalWithoutAccounts fail-closed missingAccounts", async () => {
    mocks.assetFindMany.mockResolvedValue([
      assetRow({
        depreciationMethod: "units_of_production",
        totalEstimatedUnits: D(100),
        usageRecords: [{ actualUnits: D(10) }],
        category: null,
      }),
    ])
    process.env.FIXED_ASSET_ACCOUNT_ID = "900"
    mocks.journalFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(acquisitionJournals())

    const res = await POST(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(0)
    expect(json.missingAccounts).toBe(1)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })
})
