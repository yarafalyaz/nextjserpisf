import { beforeEach, describe, expect, it, vi } from "vitest"

// Regression: the material-issue hook previously called consumeFifoLayers with
// no serialNumbers, so a serial-tracked material could never be attributed to
// the units actually issued, and the issue line never recorded which serials
// left stock. The hook must now (a) forward a caller-supplied serial selection
// to consumeFifoLayers and (b) persist the consumed serials on the line.

const mocks = vi.hoisted(() => ({
  generateDocumentNumberBatch: vi.fn(),
  consumeFifoLayers: vi.fn(),
  onMaterialIssue: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumberBatch: mocks.generateDocumentNumberBatch,
}))
vi.mock("@/lib/services/inventory-fifo", () => ({
  consumeFifoLayers: mocks.consumeFifoLayers,
}))
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: { onMaterialIssue: mocks.onMaterialIssue },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transaction(fn) },
  TxClient: class {},
}))

import { onMaterialIssueCompleted } from "@/lib/hooks/material-issue.hook"

type IssueItem = { id: number; itemId: number; qty: number; cost: number; serialNumbers?: unknown }

function wireTx(items: IssueItem[]) {
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    executeRaw: vi.fn().mockResolvedValue(1),
    issueFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 7,
      documentNo: "MI-001",
      date: new Date("2026-10-01"),
      status: "draft",
      warehouseId: 5,
      costCenterId: null,
      items,
    }),
    moveFindFirst: vi.fn().mockResolvedValue(null),
    moveCreate: vi.fn().mockResolvedValue({ id: 99 }),
    issueItemUpdate: vi.fn().mockResolvedValue({}),
    issueUpdate: vi.fn().mockResolvedValue({}),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    materialIssue: { findUniqueOrThrow: spies.issueFindUniqueOrThrow, update: spies.issueUpdate },
    materialIssueItem: { update: spies.issueItemUpdate },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
    item: { update: vi.fn().mockResolvedValue({}) },
  }
  mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
  return spies
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateDocumentNumberBatch.mockResolvedValue(["SM-1"])
  mocks.consumeFifoLayers.mockResolvedValue({
    consumedCost: 200,
    shortfall: 0,
    consumedSerials: ["SN-1", "SN-2"],
    consumedBatches: [],
  })
})

describe("material issue serial attribution", () => {
  it("forwards caller-selected serials and persists consumed serials on the line", async () => {
    const spies = wireTx([
      { id: 55, itemId: 3, qty: 2, cost: 100, serialNumbers: ["SN-1", "SN-2"] },
    ])

    await onMaterialIssueCompleted(7, 9)

    expect(mocks.consumeFifoLayers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ itemId: 3, qty: 2, serialNumbers: ["SN-1", "SN-2"] }),
    )
    expect(spies.issueItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55 }, data: { serialNumbers: ["SN-1", "SN-2"] } }),
    )
  })

  it("falls back to auto-FIFO (null serials) when no selection is provided", async () => {
    wireTx([{ id: 56, itemId: 3, qty: 2, cost: 100 }])

    await onMaterialIssueCompleted(7, 9)

    expect(mocks.consumeFifoLayers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ itemId: 3, qty: 2, serialNumbers: null }),
    )
  })
})
