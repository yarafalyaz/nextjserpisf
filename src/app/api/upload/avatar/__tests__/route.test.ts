import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  uploadToStorage: vi.fn(),
  userUpdate: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/storage/storage", () => ({
  uploadToStorage: (...a: unknown[]) => mocks.uploadToStorage(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { update: (...a: unknown[]) => mocks.userUpdate(...a) },
  },
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

describe("POST /api/upload/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authFn.mockResolvedValue({ user: { id: 7 } })
    mocks.uploadToStorage.mockResolvedValue({ url: "/storage/avatars/7.png" })
    mocks.userUpdate.mockResolvedValue({})
  })

  it("returns 401 when no session", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await POST(makeReq({}))
    expect(res.status).toBe(401)
  })

  it("returns 400 when no file or avatar field", async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it("returns 400 when user.id is invalid", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: "abc" } })
    const file = new File(["test"], "a.png", { type: "image/png" })
    const res = await POST(makeReq({ file }))
    expect(res.status).toBe(400)
  })

  it("uploads successfully and updates user row", async () => {
    const file = new File(["test"], "a.png", { type: "image/png" })
    const res = await POST(makeReq({ avatar: file }))
    const json = await res.json()
    
    expect(res.status).toBe(200)
    expect(json.url).toBe("/storage/avatars/7.png")
    expect(mocks.uploadToStorage).toHaveBeenCalledWith(file, expect.objectContaining({
      category: "avatars",
      prefix: "user-7",
      maxBytes: 2097152,
    }))
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 7 },
      data: { avatar: "/storage/avatars/7.png" },
    }))
  })

  it("accepts 'file' as alternative parameter", async () => {
    const file = new File(["test"], "a.png", { type: "image/png" })
    const res = await POST(makeReq({ file }))
    expect(res.status).toBe(200)
  })

  it("returns 400 when uploadToStorage fails", async () => {
    mocks.uploadToStorage.mockRejectedValue(new Error("Storage full"))
    const file = new File(["test"], "a.png", { type: "image/png" })
    const res = await POST(makeReq({ file }))
    expect(res.status).toBe(400)
    expect(mocks.userUpdate).not.toHaveBeenCalled()
  })
})
