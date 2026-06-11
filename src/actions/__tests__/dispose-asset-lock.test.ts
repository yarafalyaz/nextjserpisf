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
const assetUpdateManyMock = vi.fn()
const assetHistoryCreateMock = vi.fn()
const journalFindFirstMock = vi.fn()
const journalCreateMock = vi.fn()
const transactionMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    asset: { findUniqueOrThrow: (...a: unknown[]) => assetFindUniqueOrThrowMock(...a) },
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
vi.mock("@/lib/services/approval-workflow.service", () => ({ assertApproved: vi.fn(async () => undefined) }))

import { disposeAsset } from "../asset.actions"

function wireTransaction() {
  const tx = {
    asset: { updateMany: assetUpdateManyMock },
    assetHistory: { create: assetHistoryCreateMock },
    journal: { findFirst: journalFindFirstMock, create: journalCreateMock },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, parseFormDataMock,
    assetFindUniqueOrThrowMock, assetUpdateManyMock, assetHistoryCreateMock,
    journalFindFirstMock, journalCreateMock, transactionMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 4 })
  parseFormDataMock.mockReturnValue({
    success: true,
    data: { assetId: 7, proceeds: 0, disposalDate: "2026-01-15", reason: "scrap" },
  })
  assetFindUniqueOrThrowMock.mockResolvedValue({
    id: 7, code: "AST-001", name: "Mesin", status: "active",
    purchaseCost: 1000, currentValue: 400,
  })
  assetUpdateManyMock.mockResolvedValue({ count: 1 })
  assetHistoryCreateMock.mockResolvedValue({})
  journalFindFirstMock.mockResolvedValue(null) // no acquisition journal → GL branch skipped
  wireTransaction()
})

describe("disposeAsset concurrency guard", () => {
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

  it("refuses disposing an asset already marked disposed (outer guard)", async () => {
    assetFindUniqueOrThrowMock.mockResolvedValue({
      id: 7, code: "AST-001", name: "Mesin", status: "disposed",
      purchaseCost: 1000, currentValue: 0,
    })

    const result = await disposeAsset(new FormData())

    expect(result.success).toBe(false)
    expect(transactionMock).not.toHaveBeenCalled() // never enters the tx
  })
})
