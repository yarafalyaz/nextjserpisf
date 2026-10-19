import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateMock: vi.fn(),
  logActivityMock: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { systemSetting: { findFirst: mocks.findFirstMock, update: mocks.updateMock } },
}))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: any) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
  }),
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))

import { updateSystemSettings } from "../settings.actions"

function fd(payload: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.findFirstMock.mockResolvedValue({ id: 9 })
  mocks.updateMock.mockResolvedValue({})
})

describe("updateSystemSettings validasi Zod field tertulis", () => {
  it("menolak companyLogoDark > 500 char, tanpa update DB", async () => {
    await expect(
      updateSystemSettings(fd({ companyLogoDark: "x".repeat(501) })),
    ).rejects.toThrow(/Validasi gagal: companyLogoDark/)
    expect(mocks.updateMock).not.toHaveBeenCalled()
  })

  it("menolak depreciationExpenseAccountId non-bilangan, tanpa update DB", async () => {
    await expect(
      updateSystemSettings(fd({ depreciationExpenseAccountId: "abc" })),
    ).rejects.toThrow(/Validasi gagal: depreciationExpenseAccountId/)
    expect(mocks.updateMock).not.toHaveBeenCalled()
  })

  it("happy path: 3 field baru tersimpan, redirect jalan", async () => {
    await expect(
      updateSystemSettings(
        fd({
          companyLogoDark: "/logo-dark.png",
          depreciationExpenseAccountId: "12",
          accumulatedDepreciationAccountId: "13",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT")
    const data = mocks.updateMock.mock.calls.at(-1)![0].data
    expect(data.companyLogoDark).toBe("/logo-dark.png")
    expect(data.depreciationExpenseAccountId).toBe(12)
    expect(data.accumulatedDepreciationAccountId).toBe(13)
  })

  it("kosong = null utk accountId/logo-dark (clear field tetap bisa)", async () => {
    await expect(
      updateSystemSettings(
        fd({ companyLogoDark: "", depreciationExpenseAccountId: "", accumulatedDepreciationAccountId: "" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT")
    const data = mocks.updateMock.mock.calls.at(-1)![0].data
    expect(data.companyLogoDark).toBeNull()
    expect(data.depreciationExpenseAccountId).toBeNull()
    expect(data.accumulatedDepreciationAccountId).toBeNull()
  })
})
