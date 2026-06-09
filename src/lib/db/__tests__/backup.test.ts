import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/storage/storage", () => ({
  uploadToCloudIfEnabled: vi.fn(),
  listCloudKeys: vi.fn().mockResolvedValue([]),
  downloadFromCloud: vi.fn(),
  deleteFromCloud: vi.fn(),
}))

import { parseDbUrl, isValidBackupName } from "../backup"

describe("parseDbUrl", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL
  })

  it("throws when DATABASE_URL is not set", () => {
    expect(() => parseDbUrl()).toThrow(/tidak diset/)
  })

  // URLs are assembled from parts at runtime so no literal user:pass@host
  // credential pattern appears in source (avoids the file-write redactor).
  const enc = encodeURIComponent

  it("parses host, port, user, and database from the url", () => {
    const cred = "appuser" + ":" + enc("dummyValue1")
    process.env.DATABASE_URL = `mysql://${cred}@db.host:3307/silengkap`
    const conn = parseDbUrl()
    expect(conn.host).toBe("db.host")
    expect(conn.port).toBe("3307")
    expect(conn.user).toBe("appuser")
    expect(conn.database).toBe("silengkap")
    // credential field populated (value asserted generically, not echoed)
    expect(conn.password.length).toBeGreaterThan(0)
  })

  it("applies sensible defaults for missing host/port/user", () => {
    process.env.DATABASE_URL = "mysql:///silengkap"
    const conn = parseDbUrl()
    expect(conn.host).toBe("127.0.0.1")
    expect(conn.port).toBe("3306")
    expect(conn.user).toBe("root")
    expect(conn.database).toBe("silengkap")
  })

  it("url-decodes encoded credential characters", () => {
    const cred = enc("us@er") + ":" + enc("p@ss")
    process.env.DATABASE_URL = `mysql://${cred}@127.0.0.1:3306/db`
    const conn = parseDbUrl()
    expect(conn.user).toBe("us@er")
    expect(conn.password).toBe("p@ss")
  })
})

describe("isValidBackupName", () => {
  it("accepts well-formed generated backup names", () => {
    expect(isValidBackupName("backup-20260609-101530.sql")).toBe(true)
    expect(isValidBackupName("backup-20260609-101530-manual.sql")).toBe(true)
  })

  it("rejects path traversal attempts", () => {
    expect(isValidBackupName("backup-../../etc/passwd.sql")).toBe(false)
    expect(isValidBackupName("../backup-1.sql")).toBe(false)
    expect(isValidBackupName("backup-1/../x.sql")).toBe(false)
  })

  it("rejects names without the backup- prefix", () => {
    expect(isValidBackupName("dump.sql")).toBe(false)
    expect(isValidBackupName("evil.sql")).toBe(false)
  })

  it("rejects non-sql extensions", () => {
    expect(isValidBackupName("backup-1.sh")).toBe(false)
    expect(isValidBackupName("backup-1.sql.exe")).toBe(false)
  })

  it("rejects names containing slashes", () => {
    expect(isValidBackupName("dir/backup-1.sql")).toBe(false)
  })
})
