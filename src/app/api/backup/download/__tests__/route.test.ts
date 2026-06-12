import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  readBackupFile: vi.fn(),
  logActivity: vi.fn(),
}))

// Mock the fs module so createReadStream returns a real readable
vi.mock("fs", async () => {
  const { Readable } = await import("stream")
  return {
    createReadStream: () => Readable.from(["sql-content"]),
  }
})

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...a: unknown[]) => mocks.hasPermission(...a),
}))

vi.mock("@/lib/db/backup", () => ({
  readBackupFile: (...a: unknown[]) => mocks.readBackupFile(...a),
}))

vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivity(...a),
}))

vi.spyOn(console, "error").mockImplementation(() => {})

describe("GET /api/backup/download", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 when user lacks manage_settings", async () => {
    mocks.hasPermission.mockResolvedValue(false)
    const res = await GET(new NextRequest("http://localhost/api/backup/download?file=backup.sql"))
    expect(res.status).toBe(403)
  })

  it("returns 400 when filename missing", async () => {
    mocks.hasPermission.mockResolvedValue(true)
    const res = await GET(new NextRequest("http://localhost/api/backup/download"))
    expect(res.status).toBe(400)
  })

  it("returns 400 on path traversal attempt with `..`", async () => {
    mocks.hasPermission.mockResolvedValue(true)
    const res = await GET(new NextRequest("http://localhost/api/backup/download?file=..%2Fetc%2Fpasswd"))
    expect(res.status).toBe(400)
  })

  it("returns 400 when filename contains path separator", async () => {
    mocks.hasPermission.mockResolvedValue(true)
    const res = await GET(new NextRequest("http://localhost/api/backup/download?file=foo%2Fbar.sql"))
    expect(res.status).toBe(400)
  })

  it("returns 200 with file stream and audit log on success", async () => {
    mocks.hasPermission.mockResolvedValue(true)
    mocks.readBackupFile.mockResolvedValue({ path: "/tmp/backup-2026-06-12.sql", size: 1024 })
    mocks.logActivity.mockResolvedValue({})

    const res = await GET(new NextRequest("http://localhost/api/backup/download?file=backup-2026-06-12.sql"))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/sql")
    expect(res.headers.get("Content-Disposition")).toContain("backup-2026-06-12.sql")
    expect(res.headers.get("Content-Length")).toBe("1024")
    expect(mocks.logActivity).toHaveBeenCalledWith("download", "Backup", 0, expect.stringContaining("backup-2026-06-12.sql"), expect.objectContaining({ size: 1024 }))
  })

  it("does not break flow when audit log fails", async () => {
    mocks.hasPermission.mockResolvedValue(true)
    mocks.readBackupFile.mockResolvedValue({ path: "/tmp/backup-2026-06-12.sql", size: 100 })
    mocks.logActivity.mockRejectedValue(new Error("log fail"))

    const res = await GET(new NextRequest("http://localhost/api/backup/download?file=backup-2026-06-12.sql"))
    expect(res.status).toBe(200)
  })

  it("returns 500 when readBackupFile throws", async () => {
    mocks.hasPermission.mockResolvedValue(true)
    mocks.readBackupFile.mockRejectedValue(new Error("not found"))
    const res = await GET(new NextRequest("http://localhost/api/backup/download?file=missing.sql"))
    expect(res.status).toBe(500)
  })
})
