import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  hasPermissionFn: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...a: unknown[]) => mocks.hasPermissionFn(...a),
}))

vi.mock("fs/promises", () => ({
  stat: (...a: unknown[]) => mocks.stat(...a),
  readFile: (...a: unknown[]) => mocks.readFile(...a),
}))

function makeParams(category: string, filename: string) {
  return { params: Promise.resolve({ category, filename }) }
}

const AVATAR = "user-1-1730000000000-ab12cd34ef56.png"
const SIGNATURE = "signatures-u1-1730000000000-ab12cd34ef56.png"

describe("GET /api/uploads/[category]/[filename] (R7PB-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authFn.mockResolvedValue({ user: { id: 2, isActive: true } })
    mocks.hasPermissionFn.mockResolvedValue(false)
    mocks.stat.mockResolvedValue({})
    mocks.readFile.mockResolvedValue(Buffer.from("img-bytes"))
  })

  it("returns 401 when not authenticated", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await GET(new NextRequest("http://localhost/api/uploads/avatars/x"), makeParams("avatars", AVATAR))
    expect(res.status).toBe(401)
    expect(mocks.stat).not.toHaveBeenCalled()
  })

  it("returns 401 for an inactive session", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 2, isActive: false } })
    const res = await GET(new NextRequest("http://localhost/api/uploads/avatars/x"), makeParams("avatars", AVATAR))
    expect(res.status).toBe(401)
  })

  it("serves an avatar to any active session, no settings permission needed", async () => {
    const res = await GET(new NextRequest("http://localhost/api/uploads/avatars/x"), makeParams("avatars", AVATAR))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/png")
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox")
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("img-bytes")
  })

  it("returns 403 for a signature without manage_settings", async () => {
    const res = await GET(new NextRequest("http://localhost/api/uploads/signatures/x"), makeParams("signatures", SIGNATURE))
    expect(res.status).toBe(403)
    expect(mocks.stat).not.toHaveBeenCalled()
  })

  it("serves a signature to manage_settings holders", async () => {
    mocks.hasPermissionFn.mockResolvedValue(true)
    const res = await GET(new NextRequest("http://localhost/api/uploads/signatures/x"), makeParams("signatures", SIGNATURE))
    expect(res.status).toBe(200)
  })

  it("returns 404 for a public category (items/logos never served here)", async () => {
    const res = await GET(new NextRequest("http://localhost/api/uploads/items/x"), makeParams("items", AVATAR))
    expect(res.status).toBe(404)
  })

  it("returns 404 for traversal / malformed filenames", async () => {
    for (const bad of ["../secret.png", "..%2fsecret.png", "plain.png", "a-b-c.svg"]) {
      const res = await GET(new NextRequest("http://localhost/api/uploads/avatars/x"), makeParams("avatars", bad))
      expect(res.status).toBe(404)
    }
    expect(mocks.stat).not.toHaveBeenCalled()
  })

  it("returns 404 when the file is missing on disk", async () => {
    mocks.stat.mockRejectedValue(new Error("ENOENT"))
    const res = await GET(new NextRequest("http://localhost/api/uploads/avatars/x"), makeParams("avatars", AVATAR))
    expect(res.status).toBe(404)
  })
})
