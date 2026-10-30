import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isInstalled: vi.fn(),
  getSetupChecks: vi.fn(),
}))

vi.mock("@/lib/setup/install-state", () => ({ isInstalled: mocks.isInstalled }))
vi.mock("@/lib/setup/provision", () => ({ getSetupChecks: mocks.getSetupChecks }))
vi.mock("@/lib/setup/install", () => ({ installBaseData: vi.fn() }))
vi.mock("@/lib/auth/auth", () => ({ signIn: vi.fn() }))
vi.mock("@/lib/security/csrf", () => ({ assertCSRF: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { getSetupStatus } from "../setup.actions"

describe("getSetupStatus (R7PB-05)", () => {
  it("tidak memaparkan tableCount ke publik pra-instalasi", async () => {
    mocks.isInstalled.mockResolvedValue(false)
    mocks.getSetupChecks.mockResolvedValue({
      databaseConnected: true,
      schemaReady: true,
      tableCount: 42,
    })

    const status = await getSetupStatus()

    expect(status).toEqual({
      installed: false,
      checks: { databaseConnected: true, schemaReady: true },
    })
    expect(status.checks).not.toHaveProperty("tableCount")
  })

  it("sesudah terpasang, checks null", async () => {
    mocks.isInstalled.mockResolvedValue(true)

    await expect(getSetupStatus()).resolves.toEqual({ installed: true, checks: null })
    expect(mocks.getSetupChecks).not.toHaveBeenCalled()
  })
})
