import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression test for the PR row lock in onPurchaseOrderCreated.
//
// Two concurrent PO creations for the SAME purchase request used to race:
// both transactions read PR status (PENDING), each computed coverage from
// a query that excluded the other PO, and both wrote the PR status — last
// write wins and an intermediate value is lost. The fix is a
// SELECT ... FOR UPDATE on the PR row at the start of the transaction so
// the read-compute-write is serialized per PR.
//
// This test mocks the Prisma tx and asserts:
//   1. The first call inside the transaction is a SELECT ... FOR UPDATE on
//      the PR table (so the lock is the first thing acquired).
//   2. The existing happy-path + idempotency behavior still works.

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (t: unknown) => Promise<unknown>) => mocks.transaction(fn) },
}))

import { onPurchaseOrderCreated } from "@/lib/hooks/purchase-order.hook"

function wireTx(opts: {
  poId: number
  prId: number | null
  prStatus: string | null
  prItems: Array<{ itemId: number; qty: number }>
  allPoItems: Array<{ itemId: number; qty: number }>
}) {
  const lockCalls: string[] = []
  const spies = {
    queryRaw: vi.fn().mockImplementation((strings: TemplateStringsArray) => {
      // Re-join the static template parts so we can assert the full SQL
      // (a tagged template splits on every ${}: strings = [head, mid..., tail]).
      // The actual interpolated values are Prisma.Sql parameters, not raw
      // string parts, so we don't reconstruct them here.
      lockCalls.push(strings.join("__SQL_FRAGMENT__"))
      return Promise.resolve([])
    }),
    poFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: opts.poId,
      purchaseRequestId: opts.prId,
      items: [],
    }),
    prFindUnique: vi.fn().mockResolvedValue(
      opts.prId === null
        ? null
        : { id: opts.prId, status: opts.prStatus }
    ),
    prItemFindMany: vi.fn().mockResolvedValue(opts.prItems),
    poItemFindMany: vi.fn().mockResolvedValue(opts.allPoItems),
    prUpdate: vi.fn().mockResolvedValue({}),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    purchaseOrder: { findUniqueOrThrow: spies.poFindUniqueOrThrow },
    purchaseRequest: { findUnique: spies.prFindUnique, update: spies.prUpdate },
    purchaseRequestItem: { findMany: spies.prItemFindMany },
    purchaseOrderItem: { findMany: spies.poItemFindMany },
  }
  mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx))
  return { spies, tx, lockCalls }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("onPurchaseOrderCreated PR row lock", () => {
  it("acquires SELECT id FROM purchase_requests ... FOR UPDATE as the first tx action", async () => {
    const { spies, lockCalls } = wireTx({
      poId: 200,
      prId: 99,
      prStatus: "pending",
      prItems: [{ itemId: 7, qty: 10 }],
      allPoItems: [{ itemId: 7, qty: 10 }],
    })

    await onPurchaseOrderCreated(200)

    // The first $queryRaw call MUST be the PR row lock (full SQL spans
    // multiple string parts because of the ${po.purchaseRequestId} binding).
    // Asserting position (index 0) is the point of the regression: a future
    // edit must not move the lock to after the read of PO/PR status, which
    // would re-introduce the race.
    expect(lockCalls[0]).toBe(
      "SELECT id FROM purchase_requests WHERE id = __SQL_FRAGMENT__ FOR UPDATE"
    )
    // And only the one call.
    expect(spies.queryRaw).toHaveBeenCalledTimes(1)
  })

  it("does NOT lock when the PO has no linked PR (early return path)", async () => {
    const { spies, lockCalls } = wireTx({
      poId: 200,
      prId: null,
      prStatus: null,
      prItems: [],
      allPoItems: [],
    })

    await onPurchaseOrderCreated(200)

    // Standalone POs (no PR link) skip the entire PR logic — no lock taken.
    expect(spies.queryRaw).not.toHaveBeenCalled()
    expect(lockCalls).toEqual([])
  })

  it("does not re-update PR when status is already ORDERED (idempotent no-op)", async () => {
    const { spies } = wireTx({
      poId: 200,
      prId: 99,
      prStatus: PurchaseStatus.ORDERED, // already ordered
      prItems: [{ itemId: 7, qty: 10 }],
      allPoItems: [{ itemId: 7, qty: 10 }],
    })

    await onPurchaseOrderCreated(200)

    // Lock IS taken (so a concurrent PO for the same PR would block on it),
    // but no update fires — the idempotency check on the freshly-locked
    // status sees ORDERD and returns early.
    expect(spies.queryRaw).toHaveBeenCalledTimes(1)
    expect(spies.prUpdate).not.toHaveBeenCalled()
  })
})

describe("onPurchaseOrderCreated status transitions", () => {
  it("sets PR to ordered when all PR items are fully covered by POs", async () => {
    const { spies } = wireTx({
      poId: 200,
      prId: 99,
      prStatus: "pending",
      prItems: [{ itemId: 7, qty: 10 }],
      allPoItems: [{ itemId: 7, qty: 10 }],
    })

    await onPurchaseOrderCreated(200)

    expect(spies.prUpdate).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { status: PurchaseStatus.ORDERED },
    })
  })

  it("sets PR to partial_ordered when some items are still short", async () => {
    const { spies } = wireTx({
      poId: 200,
      prId: 99,
      prStatus: "pending",
      prItems: [{ itemId: 7, qty: 10 }],
      allPoItems: [{ itemId: 7, qty: 4 }], // short of 10
    })

    await onPurchaseOrderCreated(200)

    expect(spies.prUpdate).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { status: "partial_ordered" },
    })
  })
})

// Imported at the bottom because vi.mock hoists the mock before this module
// evaluates; the symbol must exist at runtime for the mocked import to bind.
import { PurchaseStatus } from "@/lib/constants"
