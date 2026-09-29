import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  revalidatePath: vi.fn(),
  findFirstWorkflow: vi.fn(),
  findFirstApproval: vi.fn(),
  findUniqueApproval: vi.fn(),
  approveStepMock: vi.fn(),
  rejectStepMock: vi.fn(),
  requestApprovalMock: vi.fn(),
  assertCSRFMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/actions/approval.actions", () => ({
  approveStep: (...a: unknown[]) => mocks.approveStepMock(...a),
  rejectStep: (...a: unknown[]) => mocks.rejectStepMock(...a),
}))

vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: (...a: unknown[]) => mocks.requestApprovalMock(...a),
}))

vi.mock("@/lib/security/csrf", () => ({
  assertCSRF: (...a: unknown[]) => mocks.assertCSRFMock(...a),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => mocks.revalidatePath(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: {
      updateMany: (...a: unknown[]) => mocks.updateMany(...a),
      findUnique: (...a: unknown[]) => mocks.findUnique(...a),
      update: (...a: unknown[]) => mocks.update(...a),
    },
    salesOrder: {
      updateMany: (...a: unknown[]) => mocks.updateMany(...a),
      findUnique: (...a: unknown[]) => mocks.findUnique(...a),
      update: (...a: unknown[]) => mocks.update(...a),
    },
    purchaseOrder: {
      updateMany: (...a: unknown[]) => mocks.updateMany(...a),
      findUnique: (...a: unknown[]) => mocks.findUnique(...a),
      update: (...a: unknown[]) => mocks.update(...a),
    },
    approvalWorkflow: {
      findFirst: (...a: unknown[]) => mocks.findFirstWorkflow(...a),
    },
    approval: {
      findFirst: (...a: unknown[]) => mocks.findFirstApproval(...a),
      findUnique: (...a: unknown[]) => mocks.findUniqueApproval(...a),
    },
  },
}))

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/workflow/x", { method: "POST" })
}

function makeParams(path: string[]) {
  return { params: Promise.resolve({ path }) }
}

const adminSession = {
  user: { id: 1, roles: ["super_admin"], permissions: [] },
}

describe("POST /api/workflow/[...path]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFirstWorkflow.mockResolvedValue(null) // Tanpa workflow secara default
  })

  it("returns 401 when not authenticated", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", "1", "approve"]))
    expect(res.status).toBe(401)
  })

  it("returns 400 when path too short", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    const res = await POST(makeReq(), makeParams(["a", "b"]))
    expect(res.status).toBe(400)
  })

  it("returns 400 when id is invalid", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", "abc", "approve"]))
    expect(res.status).toBe(400)
  })

  it("rejects IDs with suffixes, fractions, and unsafe integers", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    for (const id of ["12oops", "1.5", "9007199254740992"]) {
      const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", id, "approve"]))
      expect(res.status).toBe(400)
    }
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it("returns 404 when module key unknown", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    const res = await POST(makeReq(), makeParams(["unknown", "module", "1", "approve"]))
    expect(res.status).toBe(404)
  })

  it("returns 403 when user lacks permission and is not super_admin", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 2, roles: ["staff"], permissions: [] } })
    const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", "1", "approve"]))
    expect(res.status).toBe(403)
  })

  it("allows user with explicit permission (not super_admin)", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 2, roles: ["manager"], permissions: ["approve_quotations"] } })
    mocks.updateMany.mockResolvedValue({ count: 1 })
    const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", "1", "approve"]))
    expect(res.status).toBe(200)
  })

  it("rejects cross-site status changes", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    mocks.assertCSRFMock.mockRejectedValueOnce(new Error("CSRF validation failed: origin mismatch"))
    const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", "1", "approve"]))
    expect(res.status).toBe(403)
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it("returns 400 for invalid action", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", "1", "delete"]))
    expect(res.status).toBe(400)
  })

  it("approves successfully and revalidates", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    mocks.updateMany.mockResolvedValue({ count: 1 })

    const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", "5", "approve"]))
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.status).toBe("approved")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/penjualan/penawaran")
  })

  it("rejects successfully", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    mocks.updateMany.mockResolvedValue({ count: 1 })

    const res = await POST(makeReq(), makeParams(["penjualan", "pesanan", "5", "reject"]))
    const json = await res.json()
    expect(json.status).toBe("rejected")
  })

  it("returns 404 when row does not exist (count 0, no record)", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    mocks.updateMany.mockResolvedValue({ count: 0 })
    mocks.findUnique.mockResolvedValue(null)

    const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", "5", "approve"]))
    expect(res.status).toBe(404)
  })

  it("returns 409 conflict when row already past pending", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    mocks.updateMany.mockResolvedValue({ count: 0 })
    mocks.findUnique.mockResolvedValue({ id: 5, status: "approved" })

    const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", "5", "approve"]))
    expect(res.status).toBe(409)
  })

  it("returns 404 on Prisma P2025 error", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    const err = Object.assign(new Error("not found"), { code: "P2025" })
    mocks.updateMany.mockRejectedValue(err)

    const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", "5", "approve"]))
    expect(res.status).toBe(404)
  })

  it("returns 500 on generic error", async () => {
    mocks.authFn.mockResolvedValue(adminSession)
    mocks.updateMany.mockRejectedValue(new Error("db down"))

    const res = await POST(makeReq(), makeParams(["penjualan", "penawaran", "5", "approve"]))
    expect(res.status).toBe(500)
  })

  describe("With Active Approval Workflow", () => {
    beforeEach(() => {
      mocks.findFirstWorkflow.mockResolvedValue({ id: 1 })
    })

    it("initiates and approves workflow step and status becomes approved on last step", async () => {
      mocks.authFn.mockResolvedValue(adminSession)
      mocks.findFirstApproval.mockResolvedValueOnce(null)
      mocks.findFirstApproval.mockResolvedValueOnce({ id: 10, status: "pending" })
      mocks.approveStepMock.mockResolvedValue(undefined)
      mocks.findUniqueApproval.mockResolvedValueOnce({ id: 10, status: "approved", finalApprovedBy: 1 })

      const res = await POST(makeReq(), makeParams(["penjualan", "pesanan", "5", "approve"]))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.status).toBe("approved")
      expect(mocks.approveStepMock).toHaveBeenCalledWith(10, expect.any(FormData))
      expect(mocks.update).not.toHaveBeenCalled()
    })

    it("rejects workflow step and status becomes rejected", async () => {
      mocks.authFn.mockResolvedValue(adminSession)
      mocks.findFirstApproval.mockResolvedValueOnce({ id: 10, status: "pending" })
      mocks.rejectStepMock.mockResolvedValue(undefined)
      mocks.findUniqueApproval.mockResolvedValueOnce({ id: 10, status: "rejected" })

      const res = await POST(makeReq(), makeParams(["penjualan", "pesanan", "5", "reject"]))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.status).toBe("rejected")
      expect(mocks.rejectStepMock).toHaveBeenCalledWith(10, expect.any(FormData))
      expect(mocks.update).not.toHaveBeenCalled()
    })
  })
})
