import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  assertCSRF: vi.fn(),
  findFirstNotification: vi.fn(),
  findFirstApproval: vi.fn(),
  approveStep: vi.fn(),
  rejectStep: vi.fn(),
  markAsRead: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/security/csrf", () => ({
  assertCSRF: (...a: unknown[]) => mocks.assertCSRF(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    notification: {
      findFirst: (...a: unknown[]) => mocks.findFirstNotification(...a),
    },
    approval: {
      findFirst: (...a: unknown[]) => mocks.findFirstApproval(...a),
    },
  },
}))

vi.mock("@/actions/approval.actions", () => ({
  approveStep: (...a: unknown[]) => mocks.approveStep(...a),
  rejectStep: (...a: unknown[]) => mocks.rejectStep(...a),
}))

vi.mock("@/lib/services/notification.service", () => ({
  notificationService: {
    markAsRead: (...a: unknown[]) => mocks.markAsRead(...a),
  },
}))

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/notifications/1/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("POST /api/notifications/[id]/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assertCSRF.mockResolvedValue(undefined)
  })

  it("returns 401 when no session", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await POST(makeReq({ action: "approve" }), makeParams("1"))
    expect(res.status).toBe(401)
  })

  it("returns 400 when action is invalid", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1, isActive: true } })
    const res = await POST(makeReq({ action: "cancel" }), makeParams("1"))
    expect(res.status).toBe(400)
  })

  it("returns 404 when notification not found", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1, isActive: true } })
    mocks.findFirstNotification.mockResolvedValue(null)
    const res = await POST(makeReq({ action: "approve" }), makeParams("1"))
    expect(res.status).toBe(404)
  })

  it("returns 400 when notification body is not an approval notification", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1, isActive: true } })
    mocks.findFirstNotification.mockResolvedValue({
      id: 1,
      body: "Stok Oli Menipis, segera reorder",
    })
    const res = await POST(makeReq({ action: "approve" }), makeParams("1"))
    expect(res.status).toBe(400)
  })

  it("returns 404 when approval record is not found", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1, isActive: true } })
    mocks.findFirstNotification.mockResolvedValue({
      id: 1,
      body: "Jurnal 009 menunggu persetujuan langkah 1. Buka /pengaturan/persetujuan/journal-2",
    })
    mocks.findFirstApproval.mockResolvedValue(null)
    const res = await POST(makeReq({ action: "approve" }), makeParams("1"))
    expect(res.status).toBe(404)
  })

  it("returns 409 when approval is not pending", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1, isActive: true } })
    mocks.findFirstNotification.mockResolvedValue({
      id: 1,
      body: "Jurnal 009 menunggu persetujuan langkah 1. Buka /pengaturan/persetujuan/journal-2",
    })
    mocks.findFirstApproval.mockResolvedValue({ id: 10, status: "approved" })
    const res = await POST(makeReq({ action: "approve" }), makeParams("1"))
    expect(res.status).toBe(409)
  })

  it("successfully approves document and marks notification as read", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1, isActive: true } })
    mocks.findFirstNotification.mockResolvedValue({
      id: 1,
      body: "Jurnal 009 menunggu persetujuan langkah 1. Buka /pengaturan/persetujuan/journal-2",
    })
    mocks.findFirstApproval.mockResolvedValue({ id: 10, status: "pending" })
    mocks.approveStep.mockResolvedValue(undefined)
    mocks.markAsRead.mockResolvedValue(true)

    const res = await POST(makeReq({ action: "approve" }), makeParams("1"))
    expect(res.status).toBe(200)
    expect(mocks.approveStep).toHaveBeenCalledWith(10, expect.any(FormData))
    expect(mocks.markAsRead).toHaveBeenCalledWith(1, 1)
  })

  it("successfully rejects document and marks notification as read", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1, isActive: true } })
    mocks.findFirstNotification.mockResolvedValue({
      id: 1,
      body: "Jurnal 009 menunggu persetujuan langkah 1. Buka /pengaturan/persetujuan/journal-2",
    })
    mocks.findFirstApproval.mockResolvedValue({ id: 10, status: "pending" })
    mocks.rejectStep.mockResolvedValue(undefined)
    mocks.markAsRead.mockResolvedValue(true)

    const res = await POST(makeReq({ action: "reject" }), makeParams("1"))
    expect(res.status).toBe(200)
    expect(mocks.rejectStep).toHaveBeenCalledWith(10, expect.any(FormData))
    expect(mocks.markAsRead).toHaveBeenCalledWith(1, 1)
  })
})
