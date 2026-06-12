import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  requirePermission: vi.fn(),
  uploadToStorage: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

vi.mock("@/lib/storage/storage", () => ({
  uploadToStorage: (...a: unknown[]) => mocks.uploadToStorage(...a),
}))

vi.spyOn(console, "error").mockImplementation(() => {})

function makeReq(fields: Record<string, string | File>): NextRequest {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v as any)
  }
  return {
    formData: async () => fd,
  } as unknown as NextRequest
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.requirePermission.mockResolvedValue(true)
    mocks.uploadToStorage.mockResolvedValue({ url: "/storage/file.png" })
  })

  it("returns 401 when no session", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await POST(makeReq({ category: "avatars" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when no file provided", async () => {
    const res = await POST(makeReq({ category: "avatars" })) // missing 'file'
    expect(res.status).toBe(400)
  })

  it("returns 400 when category is invalid", async () => {
    const file = new File(["test"], "test.png", { type: "image/png" })
    const res = await POST(makeReq({ file, category: "hacker" }))
    expect(res.status).toBe(400)
  })

  it("returns 403 when user lacks permission for category", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("forbidden"))
    const file = new File(["test"], "test.png", { type: "image/png" })
    const res = await POST(makeReq({ file, category: "logos" }))
    expect(res.status).toBe(403)
  })

  it("allows avatars without permission check", async () => {
    const file = new File(["test"], "test.png", { type: "image/png" })
    const res = await POST(makeReq({ file, category: "avatars" }))
    expect(res.status).toBe(200)
    expect(mocks.requirePermission).not.toHaveBeenCalled()
  })

  it("allows attachments without permission check", async () => {
    const file = new File(["test"], "test.png", { type: "image/png" })
    const res = await POST(makeReq({ file, category: "attachments" }))
    expect(res.status).toBe(200)
    expect(mocks.requirePermission).not.toHaveBeenCalled()
  })

  it("defaults to attachments category if missing", async () => {
    const file = new File(["test"], "test.png", { type: "image/png" })
    const res = await POST(makeReq({ file }))
    expect(res.status).toBe(200)
    expect(mocks.uploadToStorage).toHaveBeenCalledWith(file, expect.objectContaining({
      category: "attachments",
      prefix: "attachments-u1",
    }))
  })

  it("uploads successfully and returns url", async () => {
    const file = new File(["test"], "test.png", { type: "image/png" })
    const res = await POST(makeReq({ file, category: "items" }))
    
    expect(mocks.requirePermission).toHaveBeenCalledWith("edit_items")
    expect(mocks.uploadToStorage).toHaveBeenCalledWith(file, expect.objectContaining({
      category: "items",
      prefix: "items-u1",
      maxBytes: 5242880,
    }))
    
    const json = await res.json()
    expect(json.url).toBe("/storage/file.png")
  })

  it("returns 400 when uploadToStorage fails", async () => {
    mocks.uploadToStorage.mockRejectedValue(new Error("File too large"))
    const file = new File(["test"], "test.png", { type: "image/png" })
    const res = await POST(makeReq({ file, category: "items" }))
    expect(res.status).toBe(400)
  })
})
