import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isInstalled: vi.fn(),
  getSetupChecks: vi.fn(),
  provisionSchema: vi.fn(),
}))

vi.mock("@/lib/setup/install-state", () => ({ isInstalled: mocks.isInstalled }))
vi.mock("@/lib/setup/provision", () => ({
  getSetupChecks: mocks.getSetupChecks,
  provisionSchema: mocks.provisionSchema,
}))
vi.mock("@/lib/setup/install", () => ({ installBaseData: vi.fn() }))
vi.mock("@/lib/auth/auth", () => ({ signIn: vi.fn() }))
vi.mock("@/lib/security/csrf", () => ({ assertCSRF: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { getSetupStatus, provisionSetupSchema } from "../setup.actions"

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

describe("provisionSetupSchema (R7PB-05 sisa)", () => {
  it("payload action juga tidak memaparkan tableCount", async () => {
    mocks.isInstalled.mockResolvedValue(false)
    mocks.getSetupChecks.mockResolvedValue({
      databaseConnected: true,
      schemaReady: true,
      tableCount: 42,
    })

    const res = await provisionSetupSchema()

    expect(res.success).toBe(true)
    expect(res.checks).toEqual({ databaseConnected: true, schemaReady: true })
    expect(res.checks).not.toHaveProperty("tableCount")
    expect(mocks.provisionSchema).not.toHaveBeenCalled()
  })

  it("jalur DB tidak terjangkau juga ter-strip", async () => {
    mocks.isInstalled.mockResolvedValue(false)
    mocks.getSetupChecks.mockResolvedValue({
      databaseConnected: false,
      schemaReady: false,
      tableCount: 0,
    })

    const res = await provisionSetupSchema()

    expect(res.success).toBe(false)
    expect(res.checks).not.toHaveProperty("tableCount")
  })
})
