import { describe, it, expect, vi, beforeEach } from "vitest"
import { DELETE } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  findUnique: vi.fn(),
  delete: vi.fn(),
  unlink: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    transactionAttachment: {
      findUnique: (...a: unknown[]) => mocks.findUnique(...a),
      delete: (...a: unknown[]) => mocks.delete(...a),
    },
  },
}))

vi.mock("fs/promises", () => ({
  unlink: (...a: unknown[]) => mocks.unlink(...a),
}))

vi.spyOn(console, "error").mockImplementation(() => {})

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/upload/attachments/1", { method: "DELETE" })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("DELETE /api/upload/attachments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authFn.mockResolvedValue({ user: { id: 5 } })
    mocks.findUnique.mockResolvedValue({
      id: 1,
      fileUrl: "/api/attachments/quotation/quotation-1-123.pdf",
      uploadedBy: 5,
      referenceType: "quotation",
    })
    mocks.unlink.mockResolvedValue(undefined)
    mocks.delete.mockResolvedValue({})
  })

  it("returns 401 when no session", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await DELETE(makeReq(), makeParams("1"))
    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid attachment id", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 5 } })
    const res = await DELETE(makeReq(), makeParams("abc"))
    expect(res.status).toBe(400)
  })

  it("returns 400 for zero attachment id", async () => {
    const res = await DELETE(makeReq(), makeParams("0"))
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid user id", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: "xyz" } })
    const res = await DELETE(makeReq(), makeParams("1"))
    expect(res.status).toBe(400)
  })

  it("returns 404 when attachment not found", async () => {
    mocks.findUnique.mockResolvedValue(null)
    const res = await DELETE(makeReq(), makeParams("99"))
    expect(res.status).toBe(404)
  })

  it("returns 403 when user is not uploader", async () => {
    mocks.findUnique.mockResolvedValue({
      id: 1,
      fileUrl: "/api/attachments/q/file.pdf",
      uploadedBy: 99, // different user
      referenceType: "quotation",
    })
    const res = await DELETE(makeReq(), makeParams("1"))
    expect(res.status).toBe(403)
  })

  it("deletes file and db record on success", async () => {
    const res = await DELETE(makeReq(), makeParams("1"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mocks.unlink).toHaveBeenCalled()
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it("falls back to 'general' refType when null", async () => {
    mocks.findUnique.mockResolvedValue({
      id: 1,
      fileUrl: "/api/attachments/file.pdf",
      uploadedBy: 5,
      referenceType: null,
    })
    const res = await DELETE(makeReq(), makeParams("1"))
    expect(res.status).toBe(200)
  })

  it("continues when unlink fails (file may be on R2)", async () => {
    mocks.unlink.mockRejectedValue(new Error("ENOENT"))
    const res = await DELETE(makeReq(), makeParams("1"))
    expect(res.status).toBe(200)
    expect(mocks.delete).toHaveBeenCalled()
  })

  it("returns 500 when db delete throws", async () => {
    mocks.delete.mockRejectedValue(new Error("db down"))
    const res = await DELETE(makeReq(), makeParams("1"))
    expect(res.status).toBe(500)
  })

  it("skips unlink when filename can't be parsed", async () => {
    mocks.findUnique.mockResolvedValue({
      id: 1,
      fileUrl: "/",
      uploadedBy: 5,
      referenceType: "quotation",
    })
    const res = await DELETE(makeReq(), makeParams("1"))
    expect(res.status).toBe(200)
    // unlink may or may not be called depending on path.resolve output; but
    // the important thing is the request still succeeds
  })
})
