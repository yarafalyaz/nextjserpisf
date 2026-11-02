import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the disposeAsset race fix. The status check ran OUTSIDE
// the transaction and the asset.update was unconditional, so two concurrent
// disposals could both pass and each post an ASSET_DISPOSAL journal + history
// (double gain/loss). The fix moves the claim inside the tx as a conditional
// updateMany WHERE status != "disposed"; the loser (count===0) throws and rolls
// back before any journal/history is written. GL accounts are left unconfigured
// here so the test focuses purely on the atomic claim, not journal building.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const parseFormDataMock = vi.fn()

const assetFindUniqueOrThrowMock = vi.fn()
const assetCategoryFindUniqueMock = vi.fn()
const assetUpdateManyMock = vi.fn()
const assetHistoryCreateMock = vi.fn()
const journalFindFirstMock = vi.fn()
const journalFindManyMock = vi.fn()
const journalCreateMock = vi.fn()
const transactionMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    asset: { findUniqueOrThrow: (...a: unknown[]) => assetFindUniqueOrThrowMock(...a) },
    assetCategory: {
      findUnique: (...a: unknown[]) => assetCategoryFindUniqueMock(...a),
    },
    systemSetting: { findFirst: vi.fn().mockResolvedValue(null) },
    journal: { findMany: (...a: unknown[]) => journalFindManyMock(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))
vi.mock("@/lib/validations/parse-form", () => ({
  parseFormData: (...a: unknown[]) => parseFormDataMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn(async () => "JRN-0001") }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: (...a: unknown[]) => logActivityMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/finance/asset-disposal", () => ({ buildAssetDisposalEntries: vi.fn(() => []) }))
const assertApprovedMock = vi.fn(async (..._a: unknown[]) => undefined)
vi.mock("@/lib/services/approval-workflow.service", () => ({ assertApproved: (...a: unknown[]) => assertApprovedMock(...a) }))

import { disposeAsset } from "../asset.actions"

function wireTransaction() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1, period_lock_date: null }]),
    documentSequence: { upsert: vi.fn().mockResolvedValue({ currentValue: 1 }) },
    asset: {
      updateMany: assetUpdateManyMock,
      findUniqueOrThrow: (...a: unknown[]) => assetFindUniqueOrThrowMock(...a),
    },
    assetCategory: {
      findUnique: (...a: unknown[]) => assetCategoryFindUniqueMock(...a),
    },
    assetHistory: { create: assetHistoryCreateMock },
    journal: { findFirst: journalFindFirstMock, findMany: journalFindManyMock, create: journalCreateMock },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, parseFormDataMock,
    assetFindUniqueOrThrowMock, assetCategoryFindUniqueMock, assetUpdateManyMock, assetHistoryCreateMock,
    journalFindFirstMock, journalFindManyMock, journalCreateMock, transactionMock,
  ]) m.mockReset()
  assertApprovedMock.mockReset()
  assertApprovedMock.mockResolvedValue(undefined)
  requirePermissionMock.mockResolvedValue({ id: 4 })
  parseFormDataMock.mockReturnValue({
    success: true,
    data: { assetId: 7, proceeds: 0, disposalDate: "2026-01-15", reason: "scrap" },
  })
  assetFindUniqueOrThrowMock.mockResolvedValue({
    id: 7, code: "AST-001", name: "Mesin", status: "active", categoryId: 1,
    purchaseCost: 1000, currentValue: 400,
  })
  assetCategoryFindUniqueMock.mockResolvedValue({
    assetAccountId: 11, accumulatedDepreciationAccountId: 12, gainLossAccountId: 14,
  })
  assetUpdateManyMock.mockResolvedValue({ count: 1 })
  assetHistoryCreateMock.mockResolvedValue({})
  journalFindFirstMock.mockResolvedValue(null) // no acquisition journal → GL branch skipped
  journalFindManyMock.mockResolvedValue([]) // tanpa jurnal POSTED → dasar legacy currentValue
  wireTransaction()
})

describe("disposeAsset concurrency guard", () => {
  it("putaran 74: approval basi dinilai ulang di dalam tx — disposal ditolak sebelum klaim", async () => {
    // Pra-tx lolos (approval lama); dalam tx (argumen ketiga terisi)
    // dokumen terbaca berubah sesudah approval final → fail-closed basi.
    assertApprovedMock.mockImplementation(async (...a: unknown[]) => {
      if (a[2]) throw new Error("Dokumen berubah sesudah persetujuan final — ajukan ulang persetujuan sebelum dilanjutkan.")
      return undefined
    })
    const result = await disposeAsset(new FormData())
    expect(result.success).toBe(false)
    expect(result.error).toContain("berubah sesudah persetujuan")
    expect(assetUpdateManyMock).not.toHaveBeenCalled()
    expect(assetHistoryCreateMock).not.toHaveBeenCalled()
    expect(journalCreateMock).not.toHaveBeenCalled()
  })

  it("disposes via an atomic conditional claim scoped to status != disposed", async () => {
    const result = await disposeAsset(new FormData())

    expect(result.success).toBe(true)
    expect(assetUpdateManyMock).toHaveBeenCalledTimes(1)
    const claimArg = assetUpdateManyMock.mock.calls[0][0]
    expect(claimArg.where.id).toBe(7)
    expect(claimArg.where.status).toEqual({ not: "disposed" })
    expect(claimArg.data.status).toBe("disposed")
    expect(assetHistoryCreateMock).toHaveBeenCalledTimes(1)
  })

  it("aborts WITHOUT writing history/journal when the claim is lost (count===0)", async () => {
    assetUpdateManyMock.mockResolvedValue({ count: 0 }) // another request won the race

    const result = await disposeAsset(new FormData())

    expect(result.success).toBe(false)
    expect(assetHistoryCreateMock).not.toHaveBeenCalled() // no double history/journal
    expect(journalCreateMock).not.toHaveBeenCalled()
  })

  it("putaran 54: mapping GL kategori dibaca ulang dari kategori aset terkunci", async () => {
    const { Prisma } = await import("@prisma/client")
    const D = (n: number) => new Prisma.Decimal(n)
    assetFindUniqueOrThrowMock
      .mockResolvedValueOnce({
        id: 7, code: "AST-001", name: "Mesin", status: "active", categoryId: 1,
        purchaseCost: 1000, currentValue: 400,
      })
      .mockResolvedValueOnce({
        id: 7, code: "AST-001", name: "Mesin", status: "active", categoryId: 2,
        purchaseCost: 1000, currentValue: 400,
      })
    assetCategoryFindUniqueMock.mockResolvedValue({
      assetAccountId: 21, accumulatedDepreciationAccountId: 22, gainLossAccountId: 24,
    })
    journalFindManyMock.mockResolvedValue([
      { referenceType: "ASSET_ACQUISITION", transactionDate: new Date("2026-01-05T00:00:00.000Z"), entries: [{ accountId: 21, debit: D(1000), credit: D(0) }] },
      { referenceType: "ASSET_DEPRECIATION_202601", transactionDate: new Date("2026-01-10T00:00:00.000Z"), entries: [{ accountId: 22, debit: D(0), credit: D(100) }] },
    ])
    journalFindFirstMock.mockResolvedValue(null)

    const res = await disposeAsset(new FormData())

    expect(res.success).toBe(true)
    expect(res.gainLoss).toBe(-900)
    expect(assetCategoryFindUniqueMock).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 2 } }))
  })

  it("riwayat disposal memakai nilai buku TERKUNCI dalam tx, bukan snapshot luar", async () => {
    // Snapshot luar: tanpa jurnal → dasar legacy currentValue 400.
    // Bacaan dalam tx (sesudah kunci aset): jurnal perolehan POSTED
    // gross 1000 − akumulasi 100 = nilai buku 900. proceeds 0 → rugi 900
    // tertulis di riwayat. buildAssetDisposalEntries di-mock [] sehingga
    // jurnal dibuat tanpa entri dan tanpa butuh akun GL.
    const { Prisma } = await import("@prisma/client")
    const D = (n: number) => new Prisma.Decimal(n)
    journalFindManyMock.mockResolvedValue([
      { referenceType: "ASSET_ACQUISITION", transactionDate: new Date("2026-01-05T00:00:00.000Z"), entries: [{ accountId: 11, debit: D(1000), credit: D(0) }] },
      { referenceType: "ASSET_DEPRECIATION_202601", transactionDate: new Date("2026-01-10T00:00:00.000Z"), entries: [{ accountId: 12, debit: D(0), credit: D(100) }] },
    ])
    // documentSequence tidak di-mock global: nextAssetJournalNumber memakai
    // tx.documentSequence — tambahkan lewat wireTransaction default tidak ada;
    // jalur ini hanya sampai riwayat karena acquisitionJournal (findFirst)
    // null → cabang GL dilewati.
    journalFindFirstMock.mockResolvedValue(null)

    const res = await disposeAsset(new FormData())

    expect(res.success).toBe(true)
    expect(res.gainLoss).toBe(-900)
    const historyArg = assetHistoryCreateMock.mock.calls[0][0]
    expect(historyArg.data.description).toContain("Nilai buku: 900")
    expect(historyArg.data.description).toContain("rugi: 900")
  })

  it("regresi putaran 47: tanggal disposal sebelum jurnal POSTED terakhir ditolak (backdate)", async () => {
    const { Prisma } = await import("@prisma/client")
    const D = (n: number) => new Prisma.Decimal(n)
    journalFindManyMock.mockResolvedValue([
      {
        referenceType: "ASSET_ACQUISITION",
        transactionDate: new Date("2026-01-10T00:00:00.000Z"),
        entries: [{ accountId: 11, debit: D(1000), credit: D(0) }],
      },
      {
        referenceType: "ASSET_DEPRECIATION_202606",
        transactionDate: new Date("2026-06-30T00:00:00.000Z"),
        entries: [{ accountId: 12, debit: D(0), credit: D(100) }],
      },
    ])
    // disposalDate fixture 2026-01-15 < jurnal terakhir 2026-06-30.
    const result = await disposeAsset(new FormData())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/tanggal jurnal|sebelum/i)
    expect(assetUpdateManyMock).not.toHaveBeenCalled()
    expect(journalCreateMock).not.toHaveBeenCalled()
  })

  it("refuses disposing an asset already marked disposed (outer guard)", async () => {
    assetFindUniqueOrThrowMock.mockResolvedValue({
      id: 7, code: "AST-001", name: "Mesin", status: "disposed",
      purchaseCost: 1000, currentValue: 0,
    })

    const result = await disposeAsset(new FormData())

    expect(result.success).toBe(false)
    expect(transactionMock).not.toHaveBeenCalled() // never enters the tx
  })

  it("fails closed (rolls back) when a GL-integrated asset's disposal accounts are incomplete", async () => {
    // Asset HAS an acquisition journal (GL-integrated) but no disposal accounts
    // are mapped. Previously the journal was silently skipped while the asset was
    // already zeroed — GL kept the asset forever. Must now throw and roll back.
    journalFindFirstMock.mockResolvedValue({ id: 1 }) // acquisition journal exists
    // Override kategori tes ini: tanpa akun terpetakan.
    assetCategoryFindUniqueMock.mockResolvedValueOnce(null)

    const result = await disposeAsset(new FormData())

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/belum dipetakan/i)
    expect(journalCreateMock).not.toHaveBeenCalled()
  })
})
