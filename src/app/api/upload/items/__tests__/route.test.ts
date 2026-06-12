import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  uploadToStorage: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...a: unknown[]) => mocks.hasPermission(...a),
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

describe("POST /api/upload/items", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // By default, grant edit_items
    mocks.hasPermission.mockImplementation(async (perm) => perm === "edit_items")
    mocks.uploadToStorage.mockResolvedValue({ url: "/storage/items/1.png" })
  })

  it("returns 403 when user lacks both create_items and edit_items", async () => {
    mocks.hasPermission.mockResolvedValue(false)
    const res = await POST(makeReq({}))
    expect(res.status).toBe(403)
  })

  it("allows user with create_items permission", async () => {
    mocks.hasPermission.mockImplementation(async (perm) => perm === "create_items")
    const file = new File(["test"], "a.png", { type: "image/png" })
    const res = await POST(makeReq({ file }))
    expect(res.status).toBe(200)
  })

  it("returns 400 when no file provided", async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it("uploads successfully and returns url", async () => {
    const file = new File(["test"], "a.png", { type: "image/png" })
    const res = await POST(makeReq({ image: file }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.url).toBe("/storage/items/1.png")
    expect(mocks.uploadToStorage).toHaveBeenCalledWith(file, expect.objectContaining({
      category: "items",
      prefix: "item",
      maxBytes: 5242880,
    }))
  })

  it("accepts 'file' as fallback parameter", async () => {
    const file = new File(["test"], "a.png", { type: "image/png" })
    const res = await POST(makeReq({ file }))
    expect(res.status).toBe(200)
  })

  it("returns 400 when uploadToStorage fails", async () => {
    mocks.uploadToStorage.mockRejectedValue(new Error("Disk full"))
    const file = new File(["test"], "a.png", { type: "image/png" })
    const res = await POST(makeReq({ file }))
    expect(res.status).toBe(400)
  })
})
