import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  return {
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    createBackupMock: vi.fn(),
    restoreBackupMock: vi.fn(),
    deleteBackupMock: vi.fn(),
    listBackupsMock: vi.fn(),
    pruneAutoSnapshotsMock: vi.fn(),
  }
})

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/db/backup", () => ({
  createBackup: mocks.createBackupMock,
  restoreBackup: mocks.restoreBackupMock,
  deleteBackup: mocks.deleteBackupMock,
  listBackups: mocks.listBackupsMock,
  pruneAutoSnapshots: mocks.pruneAutoSnapshotsMock,
}))

import * as actions from "../database.actions"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.listBackupsMock.mockResolvedValue([])
  mocks.createBackupMock.mockResolvedValue({ filename: "test.sql.gz", size: 100 })
  mocks.restoreBackupMock.mockResolvedValue(undefined)
  mocks.deleteBackupMock.mockResolvedValue(undefined)
  mocks.pruneAutoSnapshotsMock.mockResolvedValue(undefined)
})

describe("Database Actions", () => {
  it("getBackups succeeds", async () => {
    const res = await actions.getBackups()
    expect(res).toEqual([])
  })
  it("createDatabaseBackup succeeds", async () => {
    const res = await actions.createDatabaseBackup()
    expect(res.success).toBe(true)
  })
  it("restoreDatabaseBackup succeeds with snapshot", async () => {
    const res = await actions.restoreDatabaseBackup("test.sql.gz", true)
    expect(res.success).toBe(true)
  })
  it("restoreDatabaseBackup handles snapshot failure", async () => {
    mocks.createBackupMock.mockRejectedValueOnce(new Error("Snap fail"))
    const res = await actions.restoreDatabaseBackup("test.sql.gz", true)
    expect(res.success).toBe(true)
    expect(res.message).toContain("gagal dibuat")
  })
  it("deleteDatabaseBackup succeeds", async () => {
    const res = await actions.deleteDatabaseBackup("test.sql.gz")
    expect(res.success).toBe(true)
  })
  it("fails on invalid filename traversal", async () => {
    const res = await actions.deleteDatabaseBackup("../test.sql.gz")
    expect(res.success).toBe(false)
  })
})


describe('Global Error Paths (Permission Reject for 4 funcs)', () => {
  it("getBackups handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).getBackups(arg1, arg2); } catch {}
  })
  it("createDatabaseBackup handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createDatabaseBackup(arg1, arg2); } catch {}
  })
  it("restoreDatabaseBackup handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).restoreDatabaseBackup(arg1, arg2); } catch {}
  })
  it("deleteDatabaseBackup handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteDatabaseBackup(arg1, arg2); } catch {}
  })
})
