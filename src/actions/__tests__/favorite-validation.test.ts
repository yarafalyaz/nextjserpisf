import { describe, it, expect, vi, beforeEach } from "vitest"

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const findFirstMock = vi.fn()
const createMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    favoriteTransaction: {
      findFirst: (...a: unknown[]) => findFirstMock(...a),
      create: (...a: unknown[]) => createMock(...a),
    },
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))

import { createFavoriteTransaction } from "../favorite.actions"

function fd(payload: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 7 })
  findFirstMock.mockResolvedValue(null)
  createMock.mockResolvedValue({ id: 1 })
})

describe("createFavoriteTransaction Zod validation", () => {
  it("rejects empty label without touching DB", async () => {
    const res = await createFavoriteTransaction(fd({ label: "", href: "/penjualan/faktur" }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Validasi gagal")
    expect(createMock).not.toHaveBeenCalled()
  })

  it("rejects oversized label without touching DB", async () => {
    const res = await createFavoriteTransaction(
      fd({ label: "x".repeat(5000), href: "/penjualan/faktur" }),
    )
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Validasi gagal")
    expect(createMock).not.toHaveBeenCalled()
  })

  it("rejects oversized href without touching DB", async () => {
    const res = await createFavoriteTransaction(
      fd({ label: "Faktur", href: "/" + "a".repeat(600) }),
    )
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Validasi gagal")
    expect(createMock).not.toHaveBeenCalled()
  })

  it("rejects external/protocol-relative href without touching DB", async () => {
    for (const href of ["https://evil.example/x", "//evil.example/x", "javascript:alert(1)"]) {
      const res = await createFavoriteTransaction(fd({ label: "Faktur", href }))
      expect(res.success).toBe(false)
      expect(String(res.error)).toContain("jalur internal")
    }
    expect(createMock).not.toHaveBeenCalled()
  })

  it("persists trimmed label + normalized href for the session user", async () => {
    const res = await createFavoriteTransaction(
      fd({ label: "  Faktur Jual  ", href: " /penjualan/faktur " }),
    )
    expect(res.success).toBe(true)
    expect(createMock).toHaveBeenCalledWith({
      data: { userId: 7, label: "Faktur Jual", href: "/penjualan/faktur" },
    })
  })
})
