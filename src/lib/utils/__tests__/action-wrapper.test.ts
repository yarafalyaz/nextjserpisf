import { describe, it, expect, vi, beforeEach } from "vitest"

const authMock = vi.fn()
const requirePermissionMock = vi.fn()

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => authMock(...a),
}))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))

import { action } from "../action-wrapper"

function makeRedirect(): Error & { digest: string } {
  const e = new Error("NEXT_REDIRECT") as Error & { digest: string }
  e.digest = "NEXT_REDIRECT;replace;/dashboard;307;"
  return e
}

beforeEach(() => {
  authMock.mockReset()
  requirePermissionMock.mockReset()
})

describe("action() base wrapper", () => {
  it("returns the inner result on success", async () => {
    const fn = action(async () => ({ success: true, id: 1 }))
    await expect(fn()).resolves.toEqual({ success: true, id: 1 })
  })

  it("catches errors and returns a structured failure", async () => {
    const fn = action(async () => {
      throw new Error("boom")
    })
    await expect(fn()).resolves.toEqual({ success: false, error: "boom" })
  })

  it("maps prisma error codes to friendly messages", async () => {
    const fn = action(async () => {
      throw { code: "P2002" }
    })
    await expect(fn()).resolves.toEqual({
      success: false,
      error: "Data dengan nilai tersebut sudah ada.",
    })
  })

  it("re-throws NEXT_REDIRECT instead of swallowing it", async () => {
    const fn = action(async () => {
      throw makeRedirect()
    })
    await expect(fn()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    })
  })
})

describe("action().protect() auth + permission guard", () => {
  it("blocks unauthenticated calls", async () => {
    authMock.mockResolvedValue(null)
    const fn = action(async () => ({ success: true })).protect()
    await expect(fn()).resolves.toEqual({
      success: false,
      error: "Silakan login terlebih dahulu",
    })
  })

  it("runs the action when authenticated and no permission required", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } })
    const fn = action(async () => ({ success: true, ran: true })).protect()
    await expect(fn()).resolves.toEqual({ success: true, ran: true })
  })

  it("enforces the permission check when one is given", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } })
    requirePermissionMock.mockResolvedValue(undefined)
    const fn = action(async () => ({ success: true })).protect("manage_sales")
    await fn()
    expect(requirePermissionMock).toHaveBeenCalledWith("manage_sales")
  })

  it("returns a failure when the permission check throws", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } })
    requirePermissionMock.mockRejectedValue(new Error("Akses ditolak"))
    const fn = action(async () => ({ success: true })).protect("manage_sales")
    await expect(fn()).resolves.toEqual({
      success: false,
      error: "Akses ditolak",
    })
  })

  it("re-throws NEXT_REDIRECT from a protected action", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } })
    const fn = action(async () => {
      throw makeRedirect()
    }).protect()
    await expect(fn()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    })
  })
})
