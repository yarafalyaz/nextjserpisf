// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import type { Root } from "react-dom/client"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  hasPermission: vi.fn(),
  assetFindMany: vi.fn(),
  assetCount: vi.fn(),
  journalFindMany: vi.fn(),
  assetChangeEventFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
  hasPermission: mocks.hasPermission,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    asset: { findMany: mocks.assetFindMany, count: mocks.assetCount },
    journal: { findMany: mocks.journalFindMany },
    assetChangeEvent: { findMany: mocks.assetChangeEventFindMany },
  },
}))

vi.mock("@/components/auth/can-create", () => ({
  CanCreate: ({ children }: { children: unknown }) => children,
}))

vi.mock("next/link", async () => {
  const React = await import("react")
  return {
    default: ({ href, children, ...rest }: Record<string, unknown>) =>
      React.createElement("a", { href, ...rest }, children as never),
  }
})

vi.mock("../_components/asset-table", () => ({ AssetTable: () => null }))

import AssetsPage from "../page"
import { renderPageNode, unmountCard } from "@/components/reports/__tests__/card-test-utils"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
})

// Aset 1: tersusutkan penuh menurut rumus sempit (100jt − 100jt) TAPI
// jurnal revaluasi +50jt angkat nilai buku ke 50jt — tidak boleh ditandai.
// Aset 2: nilai buku jurnal benar 0 — harus ditandai.
const ASSET = {
  status: "active",
  category: {
    assetAccountId: 10,
    accumulatedDepreciationAccountId: 20,
    accumulatedImpairmentAccountId: 30,
  },
}

const ACQ = (assetId: number) => ({
  referenceId: assetId,
  referenceType: "ASSET_ACQUISITION",
  entries: [{ accountId: 10, debit: 100_000_000, credit: 0 }],
})
const DEP = (assetId: number) => ({
  referenceId: assetId,
  referenceType: "ASSET_DEPRECIATION_MONTHLY",
  entries: [
    { accountId: 99, debit: 100_000_000, credit: 0 },
    { accountId: 20, debit: 0, credit: 100_000_000 },
  ],
})
const REVAL = {
  id: 900,
  referenceType: "ASSET_CHANGE_EVENT",
  entries: [{ accountId: 10, debit: 50_000_000, credit: 0 }],
}

describe("AssetsPage kartu penanda (putaran 89)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.hasPermission.mockResolvedValue(false)
    mocks.assetCount.mockResolvedValue(2)
    // findMany pertama = tabel halaman; kedua = registry penanda.
    mocks.assetFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 1, ...ASSET, purchaseCost: 100_000_000, residualValue: 0 },
        { id: 2, ...ASSET, purchaseCost: 100_000_000, residualValue: 0 },
      ])
    mocks.journalFindMany
      .mockResolvedValueOnce([ACQ(1), DEP(1), ACQ(2), DEP(2)])
      .mockResolvedValueOnce([REVAL])
    mocks.assetChangeEventFindMany.mockResolvedValue([{ assetId: 1, journalId: 900 }])
  })

  it("revaluasi POSTED mengangkat nilai buku — aset tidak ditandai tersusutkan penuh", async () => {
    const node = await AssetsPage({ searchParams: Promise.resolve({}) })
    const { container, root } = renderPageNode(node)
    roots.push(root)
    expect(container.textContent).toContain("1 aset ·")
    expect(container.textContent).toContain("Rp 100.000.000 bruto")
  })
})
