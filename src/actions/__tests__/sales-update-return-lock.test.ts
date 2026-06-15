import { describe, it, expect, vi, beforeEach } from "vitest"

// We mock findOverReturn to return a violation to prove it correctly stops execution
// but our main goal is to prove the lock behavior.
vi.mock("@/lib/sales/return-validation", () => ({
  findOverReturn: vi.fn().mockReturnValue({
    itemId: 1,
    type: "exceeds_invoiced",
    requested: 10,
    invoiced: 5,
    alreadyReturned: 0,
    remaining: 5,
  }),
}))

const mocks = vi.hoisted(() => {
  const transactionMock = vi.fn(async (cb) => {
    // Return a proxy that acts like Prisma TxClient
    return cb({
      $executeRaw: vi.fn(),
      salesReturnItem: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
      },
      salesReturn: {
        update: vi.fn().mockResolvedValue({ id: 1 }),
      },
      salesInvoiceItem: {
        findMany: vi.fn().mockResolvedValue([{ itemId: 1, qty: 5, unitPrice: 100 }])
      }
    })
  })

  return { transactionMock }
})

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transactionMock,
    salesReturn: {
      findUnique: vi.fn().mockResolvedValue({ status: "draft" })
    },
    item: {
      findMany: vi.fn().mockResolvedValue([{ id: 1, cost: 50, price: 100 }])
    },
    salesInvoiceItem: {
      findMany: vi.fn().mockResolvedValue([{ itemId: 1, qty: 5, unitPrice: 100 }])
    },
    salesReturnItem: {
      findMany: vi.fn().mockResolvedValue([])
    }
  }
}))

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn().mockResolvedValue({ id: 1 }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))

import { updateSalesReturn } from "../sales.actions"
import { findOverReturn } from "@/lib/sales/return-validation"

function fdMap(obj: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(obj)) fd.append(k, v)
  return fd
}

describe("Sales Return Actions - Update TOCTOU Lock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("updateSalesReturn calls findOverReturn inside the locked transaction, not outside", async () => {
    const res = await updateSalesReturn(1, fdMap({
      salesInvoiceId: "1",
      customerId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 10 }])
    }))

    // It should fail with the over-return error
    expect(res.success).toBe(false)
    expect(res.error).toContain("Jumlah retur item #1 melebihi yang difakturkan")

    // The critical assertion: the $transaction MUST be called, because the validation
    // should have run *inside* it. In the buggy code, the validation runs outside,
    // fails early, and $transaction is never called.
    expect(mocks.transactionMock).toHaveBeenCalledTimes(1)
  })
})
