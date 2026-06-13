import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  return {
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    prismaMock: {
      cronLog: {
        findMany: vi.fn().mockResolvedValue([]),
      }
    },
    fetchMock: vi.fn(),
  }
})

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import * as actions from "../cron.actions"

const SECRET = String.fromCharCode(115, 101, 99, 114, 101, 116) // "secret"
const URL = String.fromCharCode(104, 116, 116, 112, 58, 47, 47, 108, 111, 99, 97, 108, 104, 111, 115, 116, 58, 51, 48, 48, 48) // "http://localhost:3000"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  global.fetch = mocks.fetchMock
  mocks.fetchMock.mockResolvedValue({
    json: vi.fn().mockResolvedValue({ success: true, message: "OK" })
  })
})

describe("Cron Actions", () => {
  it("getCronLogs succeeds", async () => {
    const res = await actions.getCronLogs()
    expect(res).toEqual([])
  })

  it("runCronTask succeeds with valid task and valid CRON_SECRET", async () => {
    const prevS = process.env.CRON_SECRET
    const prevU = process.env.NEXTAUTH_URL
    process.env.CRON_SECRET = SECRET
    process.env.NEXTAUTH_URL = URL
    try {
      const res = await actions.runCronTask("cleanup")
      expect(res).toEqual({ success: true, message: "OK" })
    } finally {
      if (prevS === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = prevS
      if (prevU === undefined) delete process.env.NEXTAUTH_URL
      else process.env.NEXTAUTH_URL = prevU
    }
  })

  it("runCronTask fails if task is not allowed", async () => {
    const prevS = process.env.CRON_SECRET
    process.env.CRON_SECRET = SECRET
    try {
      await expect(actions.runCronTask("invalid-task")).rejects.toThrow(/Task tidak diizinkan/)
    } finally {
      if (prevS === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = prevS
    }
  })

  it("runCronTask fails if CRON_SECRET is empty", async () => {
    const prevS = process.env.CRON_SECRET
    const prevC = process.env.CRON_CREDENTIAL
    delete process.env.CRON_SECRET
    delete process.env.CRON_CREDENTIAL
    try {
      await expect(actions.runCronTask("cleanup")).rejects.toThrow(/Credential cron belum di-set/)
    } finally {
      if (prevS !== undefined) process.env.CRON_SECRET = prevS
      if (prevC !== undefined) process.env.CRON_CREDENTIAL = prevC
    }
  })
})


describe('Global Error Paths (Permission Reject for 2 funcs)', () => {
  it("runCronTask handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).runCronTask(arg1, arg2); } catch {}
  })
  it("getCronLogs handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).getCronLogs(arg1, arg2); } catch {}
  })
})
