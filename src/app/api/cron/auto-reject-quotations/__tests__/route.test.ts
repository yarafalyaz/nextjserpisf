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
  flippedIds: new Set<number>(),
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
    mocks.flippedIds = new Set<number>()
    mocks.txQuotationUpdateMany.mockImplementation(async ({ where }: { where: { id: number } }) => ({
      count: mocks.flippedIds.has(where.id) ? 1 : 0,
    }))
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
    expect(json.message).toBe("Tidak ada penawaran kedaluwarsa.")
  })

  it("returns 500 on internal error", async () => {
    mocks.quotationFindMany.mockRejectedValue(new Error("db down"))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toEqual({ code: "INTERNAL_ERROR", message: "Tugas cron gagal dijalankan" })
  })

  it("processes stale quotations in one bulk update + one bulk history create", async () => {
    // Outer scan finds 2 stale quotations older than the cutoff.
    mocks.quotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    // In-tx re-read confirms both are still SENT.
    mocks.txQuotationFindMany.mockResolvedValue([
      { id: 1, revisionNumber: 2 },
      { id: 2, revisionNumber: 5 },
    ])
    // Bulk update flips both rows.
    mocks.flippedIds = new Set([1, 2])

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.rejected).toBe(2)
    expect(json.rejectedIds).toEqual([1, 2])

    // Satu updateMany bersyarat per baris + satu bulk createMany.
    expect(mocks.txQuotationUpdateMany).toHaveBeenCalledTimes(2)
    expect(mocks.txQuotationHistoryCreateMany).toHaveBeenCalledTimes(1)
    // Outer-loop create() is gone.
    expect(mocks.txQuotationHistoryCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ quotationId: 1, action: "auto_rejected", revisionNumber: 2 }),
        expect.objectContaining({ quotationId: 2, action: "auto_rejected", revisionNumber: 5 }),
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
    mocks.flippedIds = new Set([1])

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.rejected).toBe(1)
    // The update was scoped to the in-tx candidate set, not the outer scan set.
    expect(mocks.txQuotationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, status: SalesStatus.SENT },
        data: { status: Status.REJECTED },
      }),
    )
    // History is logged only for the row that was actually flipped.
    expect(mocks.txQuotationHistoryCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ quotationId: 1, action: "auto_rejected" })],
    })
  })

  it("history hanya untuk baris yang benar-benar ter-flip saat updateMany sebagian", async () => {
    mocks.quotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    mocks.txQuotationFindMany.mockResolvedValue([
      { id: 1, revisionNumber: 2 },
      { id: 2, revisionNumber: 5 },
    ])
    // Penulis lain membalik id=2 di antara baca-dalam-tx dan update:
    // updateMany hanya mengenai 1 baris. History wajib mengikuti baris
    // yang ter-flip, bukan daftar kandidat.
    mocks.flippedIds = new Set([1])

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.rejected).toBe(1)
    expect(json.rejectedIds).toEqual([1])
    expect(mocks.txQuotationHistoryCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ quotationId: 1, action: "auto_rejected", revisionNumber: 2 })],
    })
  })

  it("skips history creation when bulk updateMany affects 0 rows (status guard trims all)", async () => {
    mocks.quotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    mocks.txQuotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    // Every row flipped to non-SENT between the in-tx read and the update.
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.rejected).toBe(0)
    expect(json.message).toBe(
      "Tidak ada penawaran kedaluwarsa yang masih berstatus terkirim saat penulisan.",
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

    await GET(makeReq())
    expect(mocks.quotationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: SalesStatus.SENT,
        // F-36(c): validUntil lewat ATAU (validUntil kosong DAN updatedAt>14hr)
        OR: [
          { validUntil: { lt: expect.any(Date) } },
          {
            validUntil: null,
            updatedAt: { lt: expect.any(Date) },
          },
        ],
      }),
    }))
    const orArg = (mocks.quotationFindMany.mock.calls[0][0] as any).where.OR
    const ageMs = Date.now() - orArg[1].updatedAt.lt.getTime()
    expect(ageMs).toBeGreaterThan(13 * 24 * 3600 * 1000)
    expect(ageMs).toBeLessThan(15 * 24 * 3600 * 1000)
  })

  it("F-36(c): penawaran masih berlaku tidak masuk kandidat hanya karena updatedAt tua", async () => {
    // Query OR adalah satu-satunya gerbang kandidat: baris validUntil masa depan
    // tidak cocok cabang mana pun (cabang 1 validUntil<now gagal, cabang 2 butuh null).
    mocks.quotationFindMany.mockResolvedValue([])
    await GET(makeReq())
    const where = (mocks.quotationFindMany.mock.calls[0][0] as any).where
    expect(where.updatedAt).toBeUndefined()
    expect(where.OR[0]).toEqual({ validUntil: { lt: expect.any(Date) } })
    expect(where.OR[1].validUntil).toBeNull()
  })
})
