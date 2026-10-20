import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  isValidCron: vi.fn(),
  runDueRecurring: vi.fn(),
}))

vi.mock("@/lib/security/cron", () => ({
  isValidCronRequest: (...a: unknown[]) => mocks.isValidCron(...a),
}))

vi.mock("@/lib/services/recurring.service", () => ({
  runDueRecurring: (...a: unknown[]) => mocks.runDueRecurring(...a),
}))

import { GET } from "../route"

function makeReq(): Request {
  return new Request("http://localhost/api/cron/recurring-transactions", {
    headers: { authorization: "Bearer test" },
  })
}

describe("GET /api/cron/recurring-transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isValidCron.mockReturnValue(true)
    mocks.runDueRecurring.mockResolvedValue({ processed: 2, generated: ["A \u2192 Beban X"], errors: [] })
  })

  it("returns 401 and does not run service when cron auth invalid", async () => {
    mocks.isValidCron.mockReturnValue(false)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: "UNAUTHORIZED" })
    expect(mocks.runDueRecurring).not.toHaveBeenCalled()
  })

  it("returns processed/generated/errors on success", async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      success: true,
      processed: 2,
      generated: ["A \u2192 Beban X"],
      errors: [],
    })
    expect(mocks.runDueRecurring).toHaveBeenCalledTimes(1)
    expect(mocks.runDueRecurring.mock.calls[0][0]).toBeInstanceOf(Date)
    expect(mocks.runDueRecurring.mock.calls[0][1]).toBeNull()
  })

  it("returns service errors array without failing the whole run", async () => {
    mocks.runDueRecurring.mockResolvedValue({
      processed: 3,
      generated: ["A \u2192 Beban X"],
      errors: ["B: template tidak valid"],
    })
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toBe(3)
    expect(body.errors).toEqual(["B: template tidak valid"])
  })

  it("returns 500 with apiError shape when service throws", async () => {
    mocks.runDueRecurring.mockRejectedValue(new Error("db down"))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: "INTERNAL_ERROR" })
    expect(body.error.message).not.toContain("db down")
  })
})
