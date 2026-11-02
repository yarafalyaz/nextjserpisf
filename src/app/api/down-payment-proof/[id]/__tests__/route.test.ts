import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  hasPermissionFn: vi.fn(),
  dpFindUnique: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...a: unknown[]) => mocks.hasPermissionFn(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    downPayment: {
      findUnique: (...a: unknown[]) => mocks.dpFindUnique(...a),
    },
  },
}))

vi.mock("fs/promises", () => ({
  stat: (...a: unknown[]) => mocks.stat(...a),
  readFile: (...a: unknown[]) => mocks.readFile(...a),
}))

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

const PRIVATE_NAME = "proof-dp-123e4567-e89b-42d3-a456-426614174000.jpg"

describe("GET /api/down-payment-proof/[id] (R7PR-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authFn.mockResolvedValue({ user: { id: 1, isActive: true } })
    mocks.hasPermissionFn.mockResolvedValue(true)
    mocks.dpFindUnique.mockResolvedValue({ proofImage: PRIVATE_NAME })
    mocks.stat.mockResolvedValue({})
    mocks.readFile.mockResolvedValue(Buffer.from("proof-bytes"))
  })

  it("returns 401 when not authenticated", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await GET(new NextRequest("http://localhost/api/down-payment-proof/1"), makeParams("1"))
    expect(res.status).toBe(401)
    expect(mocks.dpFindUnique).not.toHaveBeenCalled()
  })

  it("returns 401 for an inactive session (stale JWT after deactivation)", async () => {
    mocks.authFn.mockResolvedValue({ user: { id: 1, isActive: false } })
    const res = await GET(new NextRequest("http://localhost/api/down-payment-proof/1"), makeParams("1"))
    expect(res.status).toBe(401)
  })

  it("returns 403 without view_down_payments", async () => {
    mocks.hasPermissionFn.mockResolvedValue(false)
    const res = await GET(new NextRequest("http://localhost/api/down-payment-proof/1"), makeParams("1"))
    expect(res.status).toBe(403)
    expect(mocks.dpFindUnique).not.toHaveBeenCalled()
  })

  it("returns 404 for a non-numeric id", async () => {
    const res = await GET(new NextRequest("http://localhost/api/down-payment-proof/x"), makeParams("x"))
    expect(res.status).toBe(404)
  })

  it("returns 404 when the down payment has no proof", async () => {
    mocks.dpFindUnique.mockResolvedValue({ proofImage: null })
    const res = await GET(new NextRequest("http://localhost/api/down-payment-proof/1"), makeParams("1"))
    expect(res.status).toBe(404)
  })

  it("returns 404 for a legacy public URL value (not served by this route)", async () => {
    mocks.dpFindUnique.mockResolvedValue({ proofImage: "/uploads/proofs/proof-dp-1730000000000.jpg" })
    const res = await GET(new NextRequest("http://localhost/api/down-payment-proof/1"), makeParams("1"))
    expect(res.status).toBe(404)
  })

  it("returns 404 for a malformed private name", async () => {
    mocks.dpFindUnique.mockResolvedValue({ proofImage: "proof-dp-123.jpg" })
    const res = await GET(new NextRequest("http://localhost/api/down-payment-proof/1"), makeParams("1"))
    expect(res.status).toBe(404)
  })

  it("serves the proof inline with safe headers", async () => {
    const res = await GET(new NextRequest("http://localhost/api/down-payment-proof/1"), makeParams("1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/jpeg")
    expect(res.headers.get("Content-Disposition")).toContain("inline")
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox")
    // Putaran 62: bukti bayar privat tidak disimpan browser sesudah
    // logout/pencabutan izin (standar repo: pdf/backup/export no-store).
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("proof-bytes")
  })

  it("returns 404 when the file is missing on disk", async () => {
    mocks.stat.mockRejectedValue(new Error("ENOENT"))
    const res = await GET(new NextRequest("http://localhost/api/down-payment-proof/1"), makeParams("1"))
    expect(res.status).toBe(404)
  })
})
