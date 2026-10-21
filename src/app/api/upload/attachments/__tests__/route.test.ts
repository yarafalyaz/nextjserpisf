import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST, GET } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  canAccessAttachment: vi.fn(),
  canModifyAttachment: vi.fn(),
  attachmentCreate: vi.fn(),
  attachmentFindMany: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/auth/attachment-permissions", () => ({
  canAccessAttachment: (...a: unknown[]) => mocks.canAccessAttachment(...a),
  canModifyAttachment: (...a: unknown[]) => mocks.canModifyAttachment(...a),
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
  unlink: (...a: unknown[]) => mocks.unlink(...a),
}))

function makeFile(name: string, type: string, size = 1024, bytes?: number[]): File {
  const f = new File(["x"], name, { type })
  // Override size getter (File from small content is tiny)
  Object.defineProperty(f, "size", { value: size })
  // Provide arrayBuffer: default ke signature PNG yang sah supaya tes yang
  // sudah ada ("upload sukses") tidak ikut merah oleh cek magic bytes.
  const sig = bytes ?? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
  f.arrayBuffer = async () => new Uint8Array(sig).buffer as ArrayBuffer
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
    mocks.canModifyAttachment.mockResolvedValue(true)
    mocks.attachmentCreate.mockResolvedValue({ id: 1, filename: "x" })
    mocks.writeFile.mockResolvedValue(undefined)
    mocks.mkdir.mockResolvedValue(undefined)
    mocks.unlink.mockResolvedValue(undefined)
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

  it("returns 403 when upload permission denies", async () => {
    mocks.canModifyAttachment.mockResolvedValue(false)
    const file = makeFile("a.pdf", "application/pdf")
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "1" }))
    expect(res.status).toBe(403)
  })

  it.each(["12abc", "1e3"])("returns 400 when user.id=%s is not pure decimal, no write/create", async (badId) => {
    mocks.authFn.mockResolvedValue({ user: { id: badId } })
    const file = makeFile("a.pdf", "application/pdf")
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "1" }))
    expect(res.status).toBe(400)
    expect(mocks.writeFile).not.toHaveBeenCalled()
    expect(mocks.attachmentCreate).not.toHaveBeenCalled()
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

  it("returns only contract fields on upload, never internal columns", async () => {
    // Prisma create tanpa select mengembalikan baris utuh: referenceType/
    // referenceId/uploadedBy (id pengunggah internal) tidak dipakai satu pun
    // konsumen POST — jangan bocorkan ke klien. Mock meniru semantik Prisma:
    // hanya kolom di `select` yang kembali.
    mocks.attachmentCreate.mockImplementation(async (args: any) => {
      const row: Record<string, unknown> = {
        id: 7,
        referenceType: args.data.referenceType,
        referenceId: args.data.referenceId,
        filename: "quotation-5-uuid.pdf",
        originalName: args.data.originalName,
        fileUrl: args.data.fileUrl,
        fileSize: args.data.fileSize,
        mimeType: args.data.mimeType,
        uploadedBy: args.data.uploadedBy,
        createdAt: new Date("2026-10-20T00:00:00.000Z"),
      }
      if (!args.select) return row
      return Object.fromEntries(
        Object.keys(args.select).map((k) => [k, row[k]]),
      )
    })
    const file = makeFile("invoice.pdf", "application/pdf")
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "5" }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      id: 7,
      filename: "quotation-5-uuid.pdf",
      originalName: "invoice.pdf",
      fileUrl: expect.stringMatching(
        /^\/api\/attachments\/quotation\/quotation-5-.+\.pdf$/,
      ),
      fileSize: 1024,
      mimeType: "application/pdf",
      createdAt: "2026-10-20T00:00:00.000Z",
    })
    expect(mocks.attachmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          filename: true,
          originalName: true,
          fileUrl: true,
          fileSize: true,
          mimeType: true,
          createdAt: true,
        },
      }),
    )
  })

  it("accepts an owned temporary upload for a new journal", async () => {
    const file = makeFile("journal.pdf", "application/pdf")
    const res = await POST(makePostReq({ file, referenceType: "journal", referenceId: "0" }))
    expect(res.status).toBe(200)
    expect(mocks.attachmentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ referenceType: "journal", referenceId: 0, uploadedBy: 3 }),
    }))
  })

  it("handles file with no extension (defaults to bin)", async () => {
    const file = makeFile("noext", "image/png")
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "5" }))
    expect(res.status).toBe(200)
  })

  it("returns 400 when content bytes do not match the declared type", async () => {
    // Serangan pola P2-2: header Content-Type image/png di atas isi skrip PHP.
    const evil = [0x3c, 0x3f, 0x70, 0x68, 0x70, 0x20, 0x65, 0x63, 0x68, 0x6f, 0x20, 0x31]
    const file = makeFile("evil.png", "image/png", 1024, evil)
    const res = await POST(makePostReq({ file, referenceType: "quotation", referenceId: "5" }))
    expect(res.status).toBe(400)
    expect(mocks.writeFile).not.toHaveBeenCalled()
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

  it("rejects zero referenceId for temporary types without create access", async () => {
    mocks.canModifyAttachment.mockResolvedValue(false)
    const res = await GET(makeGetReq("http://localhost/api/upload/attachments?tipeReferensi=quotation&referensiId=0"))
    expect(res.status).toBe(403)
  })

  it("returns attachment list on success", async () => {
    mocks.attachmentFindMany.mockResolvedValue([{
      id: 1,
      filename: "quotation-5-uuid.pdf",
      originalName: "invoice.pdf",
      fileUrl: "/api/attachments/quotation/quotation-5-uuid.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      createdAt: new Date("2026-10-20T00:00:00.000Z"),
    }])
    const res = await GET(makeGetReq("http://localhost/api/upload/attachments?tipeReferensi=quotation&referensiId=5"))
    const json = await res.json()
    expect(json).toEqual([{
      id: 1,
      filename: "quotation-5-uuid.pdf",
      originalName: "invoice.pdf",
      fileUrl: "/api/attachments/quotation/quotation-5-uuid.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      createdAt: "2026-10-20T00:00:00.000Z",
    }])
    // Kontrak GET hanya field yang dipakai TransactionAttachments; tanpa
    // select, referenceType/referenceId/uploadedBy ikut bocor ke klien.
    expect(mocks.attachmentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { referenceType: "quotation", referenceId: 5 },
      select: {
        id: true,
        filename: true,
        originalName: true,
        fileUrl: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
      },
    }))
  })

  it("returns 500 on internal error", async () => {
    mocks.attachmentFindMany.mockRejectedValue(new Error("db down"))
    const res = await GET(makeGetReq("http://localhost/api/upload/attachments?tipeReferensi=quotation&referensiId=5"))
    expect(res.status).toBe(500)
  })
})
