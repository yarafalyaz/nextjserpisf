import { describe, it, expect, beforeEach, vi } from "vitest"
import { EventEmitter } from "events"

vi.mock("server-only", () => ({}))

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  existsSync: vi.fn(),
  createWriteStream: vi.fn(),
  createReadStream: vi.fn(),
}))

const storageMocks = vi.hoisted(() => ({
  uploadToCloudIfEnabled: vi.fn(),
  listCloudKeys: vi.fn(),
  downloadFromCloud: vi.fn(),
  deleteFromCloud: vi.fn(),
}))

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock("fs/promises", () => ({
  mkdir: (...args: unknown[]) => fsMocks.mkdir(...args),
  readdir: (...args: unknown[]) => fsMocks.readdir(...args),
  stat: (...args: unknown[]) => fsMocks.stat(...args),
  unlink: (...args: unknown[]) => fsMocks.unlink(...args),
  readFile: (...args: unknown[]) => fsMocks.readFile(...args),
  writeFile: (...args: unknown[]) => fsMocks.writeFile(...args),
}))

vi.mock("fs", () => ({
  createWriteStream: (...args: unknown[]) => fsMocks.createWriteStream(...args),
  createReadStream: (...args: unknown[]) => fsMocks.createReadStream(...args),
  existsSync: (...args: unknown[]) => fsMocks.existsSync(...args),
}))

vi.mock("@/lib/storage/storage", () => storageMocks)

vi.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

import {
  listBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  pruneAutoSnapshots,
  readBackupFile,
} from "../backup"

function makeChildProcess(code: number | null, stderrData = "") {
    const stdout = new EventEmitter() as any
  const stderr = new EventEmitter()
  const child = new EventEmitter() as any
  // Real ChildProcess.stdout is a Readable with .pipe(); createBackup uses it.
  stdout.pipe = vi.fn()
  child.stdout = stdout
  child.stderr = stderr
  child.stdin = new EventEmitter()
  setImmediate(() => {
    if (stderrData) stderr.emit("data", stderrData)
    child.emit("close", code)
  })
  return child
}

// Builds a child that emits an "error" event (e.g. binary not found) instead of closing.
function makeErroringChild(message: string) {
    const stdout = new EventEmitter() as any
  const stderr = new EventEmitter()
  const child = new EventEmitter() as any
  stdout.pipe = vi.fn()
  child.stdout = stdout
  child.stderr = stderr
  child.stdin = new EventEmitter()
  // Pre-attach a noop listener so emit() never throws synchronously, then emit
  // on the next macrotask once createBackup has attached its real handler.
  child.on("error", () => {})
  setImmediate(() => child.emit("error", new Error(message)))
  return child
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DATABASE_URL = "mysql://tester:***@db.host:3306/testdb"
  fsMocks.mkdir.mockResolvedValue(undefined)
  fsMocks.readdir.mockResolvedValue([])
  fsMocks.stat.mockResolvedValue({ size: 1024, mtime: new Date("2026-06-12T00:00:00Z") })
  fsMocks.unlink.mockResolvedValue(undefined)
  fsMocks.readFile.mockResolvedValue(Buffer.from("SQL DATA"))
  fsMocks.writeFile.mockResolvedValue(undefined)
  fsMocks.existsSync.mockReturnValue(false)
  fsMocks.createWriteStream.mockReturnValue({ close: vi.fn() } as any)
  fsMocks.createReadStream.mockReturnValue({ pipe: vi.fn() } as any)
  storageMocks.uploadToCloudIfEnabled.mockResolvedValue(false)
  storageMocks.listCloudKeys.mockResolvedValue([])
  storageMocks.downloadFromCloud.mockResolvedValue(Buffer.from(""))
  storageMocks.deleteFromCloud.mockResolvedValue(undefined)
})

describe("listBackups", () => {
  it("returns empty array when no local backup dir and cloud is empty", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    storageMocks.listCloudKeys.mockResolvedValue([])
    const res = await listBackups()
    expect(res).toEqual([])
  })

  it("lists local backups and merges with cloud copies by filename", async () => {
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.readdir.mockResolvedValue(["a.sql", "b.sql"])
    fsMocks.stat
      .mockResolvedValueOnce({ size: 100, mtime: new Date("2026-06-01T00:00:00Z") })
      .mockResolvedValueOnce({ size: 200, mtime: new Date("2026-06-02T00:00:00Z") })
    storageMocks.listCloudKeys.mockResolvedValue(["backups/a.sql", "backups/c.sql"])

    const res = await listBackups()
    const map = Object.fromEntries(res.map((b) => [b.filename, b]))
    expect(map["a.sql"]?.cloud).toBe(true)
    expect(map["a.sql"]?.local).toBe(true)
    expect(map["b.sql"]?.local).toBe(true)
    expect(map["b.sql"]?.cloud).toBe(false)
    expect(map["c.sql"]?.local).toBe(false)
    expect(map["c.sql"]?.cloud).toBe(true)
  })

  it("still returns local list when cloud listCloudKeys throws", async () => {
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.readdir.mockResolvedValue(["a.sql"])
    storageMocks.listCloudKeys.mockRejectedValue(new Error("R2 down"))
    const res = await listBackups()
    expect(res.length).toBe(1)
    expect(res[0].filename).toBe("a.sql")
  })
})

describe("createBackup", () => {
  it("runs mysqldump with the right args, then resolves with the file metadata", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    spawnMock.mockReturnValue(makeChildProcess(0))

    const res = await createBackup("manual")
    expect(spawnMock).toHaveBeenCalledWith(
      "mysqldump",
      [
        "-hdb.host",
        "-P3306",
        "-utester",
        "--single-transaction",
        "--quick",
        "--routines",
        "--triggers",
        "--no-tablespaces",
        "--set-gtid-purged=OFF",
        "testdb",
      ],
      expect.objectContaining({
        env: expect.objectContaining({ MYSQL_PWD: "***" }),
      }),
    )
    expect(res.filename).toMatch(/^backup-manual-\d{4}-\d{2}-\d{2}-/)
    expect(res.size).toBe(1024)
    expect(res.local).toBe(true)
  })

  it("uploads to cloud and reports cloud=true when uploadToCloudIfEnabled returns true", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    spawnMock.mockReturnValue(makeChildProcess(0))
    storageMocks.uploadToCloudIfEnabled.mockResolvedValue(true)

    const res = await createBackup()
    expect(res.cloud).toBe(true)
    expect(storageMocks.uploadToCloudIfEnabled).toHaveBeenCalledWith(
      expect.stringMatching(/^backups\/backup-/),
      expect.any(Buffer),
      "application/sql",
    )
  })

  it("handles cloud upload errors gracefully and reports cloud=false", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    spawnMock.mockReturnValue(makeChildProcess(0))
    storageMocks.uploadToCloudIfEnabled.mockRejectedValue(new Error("Network failure"))
    // Swallow warn log
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const res = await createBackup()
    expect(res.cloud).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith("[backup] Upload ke cloud gagal:", "Network failure")
    warnSpy.mockRestore()
  })

  it("rejects with a clear error when mysqldump exits non-zero and cleans up the file", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    spawnMock.mockReturnValue(makeChildProcess(1, "mysqldump: access denied"))

    await expect(createBackup()).rejects.toThrow(/Backup gagal \(exit 1\): mysqldump: access denied/)
    expect(fsMocks.unlink).toHaveBeenCalled()
  })

  it("rejects when mysqldump binary cannot be spawned (error event)", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    spawnMock.mockReturnValueOnce(makeErroringChild("ENOENT: mysqldump"))

    await expect(createBackup()).rejects.toThrow(/Gagal menjalankan mysqldump: ENOENT/)
  })

  it("rejects synchronously when DATABASE_URL is unparseable", async () => {
    const originalUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = "not-a-url"
    await expect(createBackup()).rejects.toThrow()
    process.env.DATABASE_URL = originalUrl
  })
})

describe("restoreBackup", () => {
  it("rejects invalid filename without touching the database", async () => {
    await expect(restoreBackup("../../etc/passwd")).rejects.toThrow(/tidak valid/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it("runs mysql with the backup piped in when local file exists", async () => {
    fsMocks.existsSync.mockReturnValue(true)
    spawnMock.mockReturnValue(makeChildProcess(0))

    await restoreBackup("backup-20260612-101530.sql")
    expect(spawnMock).toHaveBeenCalledWith(
      "mysql",
      ["-hdb.host", "-P3306", "-utester", "testdb"],
      expect.objectContaining({ env: expect.objectContaining({ MYSQL_PWD: "***" }) }),
    )
  })

  it("downloads from cloud when the local file is missing", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    storageMocks.downloadFromCloud.mockResolvedValue(Buffer.from("cloud-sql"))
    spawnMock.mockReturnValue(makeChildProcess(0))

    await restoreBackup("backup-20260612-101530.sql")
    expect(storageMocks.downloadFromCloud).toHaveBeenCalledWith("backups/backup-20260612-101530.sql")
    expect(fsMocks.writeFile).toHaveBeenCalled()
  })

  it("throws when neither local nor cloud copy is available", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    storageMocks.downloadFromCloud.mockRejectedValue(new Error("not found"))
    await expect(restoreBackup("backup-20260612-101530.sql")).rejects.toThrow(/tidak ditemukan/)
  })

  it("rejects when mysql exits non-zero", async () => {
    fsMocks.existsSync.mockReturnValue(true)
    spawnMock.mockReturnValue(makeChildProcess(1, "ERROR 1045"))
    await expect(restoreBackup("backup-20260612-101530.sql")).rejects.toThrow(/Restore gagal \(exit 1\)/)
  })
})

describe("deleteBackup", () => {
  it("rejects invalid filename", async () => {
    await expect(deleteBackup("../x.sql")).rejects.toThrow(/tidak valid/)
  })

  it("removes local file when present and always calls deleteFromCloud", async () => {
    fsMocks.existsSync.mockReturnValue(true)
    await deleteBackup("backup-20260612-101530.sql")
    expect(fsMocks.unlink).toHaveBeenCalled()
    expect(storageMocks.deleteFromCloud).toHaveBeenCalledWith("backups/backup-20260612-101530.sql")
  })

  it("skips unlink when local file is absent but still tries cloud delete", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    await deleteBackup("backup-20260612-101530.sql")
    expect(fsMocks.unlink).not.toHaveBeenCalled()
    expect(storageMocks.deleteFromCloud).toHaveBeenCalled()
  })

  it("swallows cloud delete errors", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    storageMocks.deleteFromCloud.mockRejectedValue(new Error("R2 down"))
    await expect(deleteBackup("backup-20260612-101530.sql")).resolves.toBeUndefined()
  })
})

describe("pruneAutoSnapshots", () => {
  it("deletes local autosnap files but not manual ones", async () => {
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.readdir.mockResolvedValue([
      "backup-autosnap-20260612-101530.sql",
      "backup-manual-20260612-101530.sql",
      "backup-autosnap-20260611-101530.sql",
    ])
    await pruneAutoSnapshots()
    const calls = fsMocks.unlink.mock.calls.map((c) => c[0] as string)
    expect(calls.some((p) => p.includes("autosnap"))).toBe(true)
    expect(calls.every((p) => !p.includes("manual"))).toBe(true)
  })

  it("removes cloud autosnap keys too", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    storageMocks.listCloudKeys.mockResolvedValue(["backups/backup-autosnap-x.sql"])
    await pruneAutoSnapshots()
    expect(storageMocks.deleteFromCloud).toHaveBeenCalledWith("backups/backup-autosnap-x.sql")
  })

  it("swallows cloud list errors", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    storageMocks.listCloudKeys.mockRejectedValue(new Error("R2 down"))
    await expect(pruneAutoSnapshots()).resolves.toBeUndefined()
  })
})

describe("readBackupFile", () => {
  it("rejects invalid filename", async () => {
    await expect(readBackupFile("../x.sql")).rejects.toThrow(/tidak valid/)
  })

  it("returns size and path when file exists locally", async () => {
    fsMocks.existsSync.mockReturnValue(true)
    const res = await readBackupFile("backup-20260612-101530.sql")
    expect(res.size).toBe(1024)
    expect(res.path).toMatch(/backups[\\/]backup-/)
    expect(storageMocks.downloadFromCloud).not.toHaveBeenCalled()
  })

  it("downloads from cloud when local file is missing", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    storageMocks.downloadFromCloud.mockResolvedValue(Buffer.from("data"))
    const res = await readBackupFile("backup-20260612-101530.sql")
    expect(fsMocks.writeFile).toHaveBeenCalled()
    expect(res.size).toBe(1024)
  })

  it("throws when neither local nor cloud has the file", async () => {
    fsMocks.existsSync.mockReturnValue(false)
    storageMocks.downloadFromCloud.mockRejectedValue(new Error("not found"))
    await expect(readBackupFile("backup-20260612-101530.sql")).rejects.toThrow(/tidak ditemukan/)
  })
})
