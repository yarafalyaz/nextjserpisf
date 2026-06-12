import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST, GET } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  canAccessAttachment: vi.fn(),
  attachmentCreate: vi.fn(),
  attachmentFindMany: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/auth/attachment-permissions", () => ({
  canAccessAttachment: (...a: unknown[]) => mocks.canAccessAttachment(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    transactionAttachment: {
      create: (...a: unknown[]) => mocks.attachmentCreate(...a),
      findMany: (...a: unknown[]) => mocks.attachmentFindMany(...a),
    },
  },
}))

vi.mock("fs/promises", () => ({
  writeFile: (...a: unknown[]) => mocks.writeFile(...a),
  mkdir: (...a: unknown[]) => mocks.mkdir(...a),
}))

function makeFile(name: string, type: string, size = 1024): File {
  const f = new File(["x"], name, { type })
  // Override size getter (File from small content is tiny)
  Object.defineProperty(f, "size", { value: size })
  // Provide arrayBuffer
  f.arrayBuffer = async () => new ArrayBuffer(8)
  return f
}

function makePostReq(fields: Record<string, string | File>): NextRequest {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v as any)
  }
  return { formData: async () => fd } as unknown as NextRequest
}

function makeGetReq(url: string): NextRequest {
  return { url } as unknown as NextRequest
}

describe("POST /api/upload/attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authFn.mockResolvedValue({ user: { id: 3 } })
    mocks.canAccessAttachment.mockResolvedValue(true)
    mocks.attachmentCreate.mockResolvedValue({ id: 1, filename: "x" })
    mocks.writeFile.mockResolvedValue(undefined)
    mocks.mkdir.mockResolvedValue(undefined)
  })

  it("returns 401 when no session", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await POST(makePostReq({}))
    expect(res.status).toBe(401)
  })

  it("returns 400 when no file", async () => {
    const res = await POST(makePostReq({ referenceType: "quotation", referenceId: "1" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when reference fields missing", async () => {
    const file = makeFile("a.pdf", "application/pdf")
    const res = await POST(makePostReq({ file }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for disallowed file type", async () => {
    const file = makeFile("a.exe", "application/x-msdownload")
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "1" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when file too large", async () => {
    const file = makeFile("a.pdf", "application/pdf", 51 * 1024 * 1024)
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "1" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for non-numeric referenceId", async () => {
    const file = makeFile("a.pdf", "application/pdf")
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "abc" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid referenceType chars (path traversal)", async () => {
    const file = makeFile("a.pdf", "application/pdf")
    const res = await POST(makePostReq({ file, referenceType: "../etc", referenceId: "1" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for referenceType not in whitelist", async () => {
    const file = makeFile("a.pdf", "application/pdf")
    const res = await POST(makePostReq({ file, referenceType: "secret_table", referenceId: "1" }))
    expect(res.status).toBe(400)
  })

  it("returns 403 when canAccessAttachment denies", async () => {
    mocks.canAccessAttachment.mockResolvedValue(false)
    const file = makeFile("a.pdf", "application/pdf")
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "1" }))
    expect(res.status).toBe(403)
  })

  it("uploads successfully and writes to db", async () => {
    const file = makeFile("invoice.pdf", "application/pdf")
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "5" }))
    expect(res.status).toBe(200)
    expect(mocks.mkdir).toHaveBeenCalled()
    expect(mocks.writeFile).toHaveBeenCalled()
    expect(mocks.attachmentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        referenceType: "quotation",
        referenceId: 5,
        originalName: "invoice.pdf",
        uploadedBy: 3,
      }),
    }))
  })

  it("handles file with no extension (defaults to bin)", async () => {
    const file = makeFile("noext", "image/png")
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "5" }))
    expect(res.status).toBe(200)
  })

  it("returns 500 on internal error", async () => {
    mocks.attachmentCreate.mockRejectedValue(new Error("db down"))
    const file = makeFile("a.pdf", "application/pdf")
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "5" }))
    expect(res.status).toBe(500)
  })
})

describe("GET /api/upload/attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authFn.mockResolvedValue({ user: { id: 3 } })
    mocks.canAccessAttachment.mockResolvedValue(true)
    mocks.attachmentFindMany.mockResolvedValue([{ id: 1 }])
  })

  it("returns 401 when no session", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await GET(makeGetReq("http://localhost/api/upload/attachments"))
    expect(res.status).toBe(401)
  })

  it("returns 400 when reference params missing", async () => {
    const res = await GET(makeGetReq("http://localhost/api/upload/attachments"))
    expect(res.status).toBe(400)
  })

  it("returns 400 for referenceType not in whitelist", async () => {
    const res = await GET(makeGetReq("http://localhost/api/upload/attachments?tipeReferensi=hax&referensiId=1"))
    expect(res.status).toBe(400)
  })

  it("returns 403 when access denied", async () => {
    mocks.canAccessAttachment.mockResolvedValue(false)
    const res = await GET(makeGetReq("http://localhost/api/upload/attachments?tipeReferensi=quotation&referensiId=1"))
    expect(res.status).toBe(403)
  })

  it("returns 400 for non-numeric referenceId", async () => {
    const res = await GET(makeGetReq("http://localhost/api/upload/attachments?tipeReferensi=quotation&referensiId=abc"))
    expect(res.status).toBe(400)
  })

  it("returns 400 for zero referenceId", async () => {
    const res = await GET(makeGetReq("http://localhost/api/upload/attachments?tipeReferensi=quotation&referensiId=0"))
    expect(res.status).toBe(400)
  })

  it("returns attachment list on success", async () => {
    const res = await GET(makeGetReq("http://localhost/api/upload/attachments?tipeReferensi=quotation&referensiId=5"))
    const json = await res.json()
    expect(json).toEqual([{ id: 1 }])
    expect(mocks.attachmentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { referenceType: "quotation", referenceId: 5 },
    }))
  })

  it("returns 500 on internal error", async () => {
    mocks.attachmentFindMany.mockRejectedValue(new Error("db down"))
    const res = await GET(makeGetReq("http://localhost/api/upload/attachments?tipeReferensi=quotation&referensiId=5"))
    expect(res.status).toBe(500)
  })
})
