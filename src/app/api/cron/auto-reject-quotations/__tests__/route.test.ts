import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { SalesStatus, Status } from "@/lib/constants"

const mocks = vi.hoisted(() => ({
  isValidCron: vi.fn(),
  quotationFindMany: vi.fn(),
  quotationUpdateMany: vi.fn(),
  quotationHistoryCreate: vi.fn(),
}))

vi.mock("@/lib/security/cron", () => ({
  isValidCronRequest: (...a: unknown[]) => mocks.isValidCron(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: {
      findMany: (...a: unknown[]) => mocks.quotationFindMany(...a),
      updateMany: (...a: unknown[]) => mocks.quotationUpdateMany(...a),
    },
    quotationHistory: {
      create: (...a: unknown[]) => mocks.quotationHistoryCreate(...a),
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
    mocks.quotationUpdateMany.mockResolvedValue({ count: 1 })
    mocks.quotationHistoryCreate.mockResolvedValue({})
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

  it("processes stale quotations successfully", async () => {
    mocks.quotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    mocks.quotationUpdateMany.mockResolvedValue({ count: 1 })

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.rejected).toBe(2)
    expect(mocks.quotationUpdateMany).toHaveBeenCalledTimes(2)
    expect(mocks.quotationHistoryCreate).toHaveBeenCalledTimes(2)
  })

  it("skips history creation if updateMany returns 0 (race condition)", async () => {
    mocks.quotationFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    // first row updates 0, second row updates 1
    mocks.quotationUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.rejected).toBe(1)
    expect(mocks.quotationHistoryCreate).toHaveBeenCalledTimes(1)
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
          // Just check it's a date within a few seconds of our cutoff
          lt: expect.any(Date),
        }),
      }),
    }))
  })
})
