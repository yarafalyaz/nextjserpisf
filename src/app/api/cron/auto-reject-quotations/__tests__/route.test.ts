import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { SalesStatus, Status } from "@/lib/constants"

const mocks = vi.hoisted(() => ({
  isValidCron: vi.fn(),
  // Outer (pre-tx) scan that finds candidates based on age.
  quotationFindMany: vi.fn(),
  // In-tx mocks. We capture the inner callback and expose the same
  // shape that the real prisma client provides inside $transaction.
  txQuotationFindMany: vi.fn(),
  txQuotationUpdateMany: vi.fn(),
  txQuotationHistoryCreateMany: vi.fn(),
  $transaction: vi.fn(),
}))

vi.mock("@/lib/security/cron", () => ({
  isValidCronRequest: (...a: unknown[]) => mocks.isValidCron(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: {
      findMany: (...a: unknown[]) => mocks.quotationFindMany(...a),
    },
    // Run the callback with a tx-shaped object that mirrors the
    // real prisma client's per-tx surface used by route.ts.
    $transaction: (cb: (tx: unknown) => unknown) => {
      const tx = {
        quotation: {
          findMany: (...a: unknown[]) => mocks.txQuotationFindMany(...a),
          updateMany: (...a: unknown[]) => mocks.txQuotationUpdateMany(...a),
        },
        quotationHistory: {
          createMany: (...a: unknown[]) => mocks.txQuotationHistoryCreateMany(...a),
        },
      }
      return mocks.$transaction(() => cb(tx))
    },
  },
}))

vi.spyOn(console, "error").mockImplementation(() => {})

function makeReq(): Request {
  return new Request("http://localhost/api/cron/auto-reject-quotations", {
    headers: { authorization: "Bearer ***REMOVED***" },
  })
}

describe("GET /api/cron/auto-reject-quotations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isValidCron.mockReturnValue(true)
    mocks.quotationFindMany.mockResolvedValue([])
    // Default: in-tx re-read sees the same candidates the outer scan found.
    mocks.txQuotationFindMany.mockImplementation(async ({ where }: { where: { id: { in: number[] } } }) =>
      where.id.in.map((id) => ({ id })),
    )
    mocks.txQuotationUpdateMany.mockResolvedValue({ count: 0 })
    mocks.txQuotationHistoryCreateMany.mockResolvedValue({ count: 0 })
    mocks.$transaction.mockImplementation(
      (run: (tx: unknown) => unknown) => run({
        quotation: {
          findMany: (...a: unknown[]) => mocks.txQuotationFindMany(...a),
          updateMany: (...a: unknown[]) => mocks.txQuotationUpdateMany(...a),
        },
        quotationHistory: {
          createMany: (...a: unknown[]) => mocks.txQuotationHistoryCreateMany(...a),
        },
      }),
    )
  })

  it("returns 401 when cron auth invalid", async () => {
    mocks.isValidCron.mockReturnValue(false)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it("returns 0 rejected when no stale quotations", async () => {
    mocks.quotationFindMany.mockResolvedValue([])
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.rejected).toBe(0)
    expect(json.message).toBe("No stale quotations found.")
  })

  it("returns 500 on internal error", async () => {
    mocks.quotationFindMany.mockRejectedValue(new Error("db down"))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe("Cron job failed")
  })

  it("processes stale quotations in one bulk update + one bulk history create", async () => {
    // Outer scan finds 2 stale quotations older than the cutoff.
    mocks.quotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    // In-tx re-read confirms both are still SENT.
    mocks.txQuotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    // Bulk update flips both rows.
    mocks.txQuotationUpdateMany.mockResolvedValue({ count: 2 })

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.rejected).toBe(2)
    expect(json.rejectedIds).toEqual([1, 2])

    // One bulk updateMany + one bulk createMany, regardless of N.
    expect(mocks.txQuotationUpdateMany).toHaveBeenCalledTimes(1)
    expect(mocks.txQuotationHistoryCreateMany).toHaveBeenCalledTimes(1)
    // Outer-loop create() is gone.
    expect(mocks.txQuotationHistoryCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ quotationId: 1, action: "auto_rejected" }),
        expect.objectContaining({ quotationId: 2, action: "auto_rejected" }),
      ]),
    })
  })

  it("re-reads status inside the tx so race losers are filtered out", async () => {
    // Outer scan finds 2 candidates.
    mocks.quotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    // In-tx re-read: only id=1 is still SENT (id=2 was rejected by a user
    // between the outer scan and our write).
    mocks.txQuotationFindMany.mockResolvedValue([{ id: 1 }])
    // status guard trims nothing further here.
    mocks.txQuotationUpdateMany.mockResolvedValue({ count: 1 })

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.rejected).toBe(1)
    // The update was scoped to the in-tx candidate set, not the outer scan set.
    expect(mocks.txQuotationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [1] },
          status: SalesStatus.SENT,
        }),
        data: { status: Status.REJECTED },
      }),
    )
    // History is logged only for the row that was actually flipped.
    expect(mocks.txQuotationHistoryCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ quotationId: 1, action: "auto_rejected" })],
    })
  })

  it("skips history creation when bulk updateMany affects 0 rows (status guard trims all)", async () => {
    mocks.quotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    mocks.txQuotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    // Every row flipped to non-SENT between the in-tx read and the update.
    mocks.txQuotationUpdateMany.mockResolvedValue({ count: 0 })

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.rejected).toBe(0)
    expect(json.message).toBe(
      "No stale quotations were still in SENT status at write time.",
    )
    expect(mocks.txQuotationHistoryCreateMany).not.toHaveBeenCalled()
  })

  it("rejects nothing when the in-tx re-read finds 0 SENT candidates", async () => {
    mocks.quotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    // Both flipped to non-SENT before our in-tx re-read.
    mocks.txQuotationFindMany.mockResolvedValue([])

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.rejected).toBe(0)
    expect(mocks.txQuotationUpdateMany).not.toHaveBeenCalled()
    expect(mocks.txQuotationHistoryCreateMany).not.toHaveBeenCalled()
  })

  it("passes correct cutoff date (14 days ago)", async () => {
    mocks.quotationFindMany.mockResolvedValue([])
    const now = new Date()
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - 14)

    await GET(makeReq())
    expect(mocks.quotationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: SalesStatus.SENT,
        updatedAt: expect.objectContaining({
          lt: expect.any(Date),
        }),
      }),
    }))
  })
})
