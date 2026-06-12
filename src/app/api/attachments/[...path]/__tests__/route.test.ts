import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  canAccessAttachment: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/auth/attachment-permissions", () => ({
  canAccessAttachment: (...a: unknown[]) => mocks.canAccessAttachment(...a),
}))

vi.mock("fs/promises", () => ({
  stat: (...a: unknown[]) => mocks.stat(...a),
  readFile: (...a: unknown[]) => mocks.readFile(...a),
}))

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/attachments/quotation/file.pdf")
}

function makeParams(path: string[]) {
  return { params: Promise.resolve({ path }) }
}

describe("GET /api/attachments/[...path]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.canAccessAttachment.mockResolvedValue(true)
    mocks.stat.mockResolvedValue({})
    mocks.readFile.mockResolvedValue(Buffer.from("file-bytes"))
  })

  it("returns 401 when not authenticated", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await GET(makeReq(), makeParams(["quotation", "file.pdf"]))
    expect(res.status).toBe(401)
  })

  it("returns 404 when path too short", async () => {
    const res = await GET(makeReq(), makeParams(["quotation"]))
    expect(res.status).toBe(404)
  })

  it("returns 400 when path contains traversal segment '..'", async () => {
    const res = await GET(makeReq(), makeParams(["quotation", "..", "file.pdf"]))
    expect(res.status).toBe(400)
  })

  it("returns 400 when path contains slash in segment", async () => {
    const res = await GET(makeReq(), makeParams(["quotation/hax", "file.pdf"]))
    expect(res.status).toBe(400)
  })

  it("returns 403 when canAccessAttachment denies access", async () => {
    mocks.canAccessAttachment.mockResolvedValue(false)
    const res = await GET(makeReq(), makeParams(["quotation", "file.pdf"]))
    expect(res.status).toBe(403)
  })

  it("returns 400 when path falls outside private dir (fallback check)", async () => {
    // This is hard to trigger with join because we filter out '..' segments,
    // but we can pass an absolute segment if allowed.
    const res = await GET(makeReq(), makeParams(["/etc", "passwd"]))
    expect(res.status).toBe(400)
  })

  it("returns 404 when file does not exist", async () => {
    mocks.stat.mockRejectedValue(new Error("ENOENT"))
    const res = await GET(makeReq(), makeParams(["quotation", "file.pdf"]))
    expect(res.status).toBe(404)
  })

  it("returns file content with correct Content-Type (pdf)", async () => {
    const res = await GET(makeReq(), makeParams(["quotation", "file.pdf"]))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/pdf")
    const bytes = await res.arrayBuffer()
    expect(Buffer.from(bytes).toString()).toBe("file-bytes")
  })

  it("returns file content with correct Content-Type (png)", async () => {
    const res = await GET(makeReq(), makeParams(["quotation", "file.png"]))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/png")
  })

  it("falls back to application/octet-stream for unknown ext", async () => {
    const res = await GET(makeReq(), makeParams(["quotation", "file.xyz"]))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream")
  })
})
