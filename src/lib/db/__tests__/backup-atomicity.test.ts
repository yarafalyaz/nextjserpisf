import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { EventEmitter } from "events"
import { PassThrough, Readable } from "stream"
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from "fs"
import os from "os"
import path from "path"

vi.mock("server-only", () => ({}))

const spawnMock = vi.hoisted(() => vi.fn())
const storageMocks = vi.hoisted(() => ({
  uploadToCloudIfEnabled: vi.fn(),
  listCloudKeys: vi.fn(),
  downloadFromCloud: vi.fn(),
  downloadFromCloudStream: vi.fn(),
  deleteFromCloud: vi.fn(),
}))

vi.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))
vi.mock("@/lib/storage/storage", () => storageMocks)

type BackupModule = typeof import("../backup")

let tmpDir: string
let backupDir: string
let cwdSpy: ReturnType<typeof vi.spyOn>
let mod: BackupModule

beforeEach(async () => {
  vi.clearAllMocks()
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "backup-atomicity-"))
  backupDir = path.join(tmpDir, "backups")
  process.env.DATABASE_URL = "mysql://tester:***@127.0.0.1:3306/testdb"
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir)
  storageMocks.uploadToCloudIfEnabled.mockResolvedValue(false)
  storageMocks.listCloudKeys.mockResolvedValue([])
  storageMocks.downloadFromCloudStream.mockRejectedValue(new Error("not found"))
  storageMocks.deleteFromCloud.mockResolvedValue(undefined)
  vi.resetModules()
  mod = await import("../backup")
})

afterEach(async () => {
  cwdSpy.mockRestore()
  // Let any destroyed ReadStream finish closing on libuv before removing tmpDir
  await new Promise((r) => setTimeout(r, 15))
  if (tmpDir) {
    try {
      chmodSync(backupDir, 0o755)
    } catch {
      // ignore if backupDir was never created
    }
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

function makeMockChild() {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const stdin = new PassThrough()
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    stdin: PassThrough
    killed: boolean
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = stdout
  child.stderr = stderr
  child.stdin = stdin
  child.killed = false
  child.kill = vi.fn(() => {
    child.killed = true
    return true
  })
  return child
}

describe("H1: backup.ts atomicity, stream errors, and R2 streaming (real fs)", () => {
  it("writes to .tmp first, hides .tmp from listBackups(), then atomically renames after finish", async () => {
    const child = makeMockChild()
    spawnMock.mockReturnValue(child)

    const promise = mod.createBackup("atomic")

    // Wait for createWriteStream(.tmp) + initial chunk flush
    await new Promise((r) => setTimeout(r, 40))
    child.stdout.write("-- partial dump\n")
    await new Promise((r) => setTimeout(r, 30))

    const duringFiles = readdirSync(backupDir)
    expect(duringFiles).toHaveLength(1)
    expect(duringFiles[0]).toMatch(/^backup-atomic-.*\.sql\.tmp$/)
    expect(await mod.listBackups()).toEqual([])

    // Complete dump
    child.stdout.write("-- complete dump\n")
    child.stdout.end()
    child.emit("close", 0)

    const result = await promise
    const afterFiles = readdirSync(backupDir)
    expect(afterFiles).toEqual([result.filename])
    expect(afterFiles.some((f) => f.endsWith(".tmp"))).toBe(false)
    expect(readFileSync(path.join(backupDir, result.filename), "utf8")).toBe(
      "-- partial dump\n-- complete dump\n",
    )
    expect(result.size).toBe(Buffer.byteLength("-- partial dump\n-- complete dump\n"))
  })

  it("cleans up .tmp / 0-byte files when mysqldump spawn emits error (ENOENT)", async () => {
    const child = makeMockChild()
    spawnMock.mockReturnValue(child)

    const promise = mod.createBackup("enoent")
    await new Promise((r) => setTimeout(r, 30))
    child.emit("error", new Error("spawn mysqldump ENOENT"))

    await expect(promise).rejects.toThrow(/Gagal menjalankan mysqldump/)
    expect(readdirSync(backupDir)).toEqual([])
  })

  it("cleans up .tmp file when mysqldump exits non-zero", async () => {
    const child = makeMockChild()
    spawnMock.mockReturnValue(child)

    const promise = mod.createBackup("fail")
    await new Promise((r) => setTimeout(r, 30))
    child.stdout.write("-- aborted dump\n")
    child.stderr.write("Access denied")
    child.stdout.end()
    child.emit("close", 2)

    await expect(promise).rejects.toThrow(/Backup gagal \(exit 2\): Access denied/)
    expect(readdirSync(backupDir)).toEqual([])
  })

  it("handles write stream EACCES error without crashing Node and leaves no orphan files", async () => {
    mkdirSync(backupDir, { recursive: true })
    chmodSync(backupDir, 0o555)
    const child = makeMockChild()
    spawnMock.mockReturnValue(child)

    await expect(mod.createBackup("readonly")).rejects.toThrow(/Gagal menulis file backup/)
    chmodSync(backupDir, 0o755)
    expect(readdirSync(backupDir)).toEqual([])
  })

  it("streams R2 PutObjectCommand via Readable stream instead of buffering with readFile", async () => {
    const child = makeMockChild()
    spawnMock.mockReturnValue(child)

    let uploadedIsBuffer = true
    let uploadedText = ""
    let uploadedLength: number | undefined
    storageMocks.uploadToCloudIfEnabled.mockImplementation(
      async (_key: string, body: unknown, _type: string, len?: number) => {
        uploadedIsBuffer = Buffer.isBuffer(body)
        uploadedLength = len
        const chunks: Buffer[] = []
        for await (const c of body as Readable) chunks.push(Buffer.from(c))
        uploadedText = Buffer.concat(chunks).toString("utf8")
        return true
      },
    )

    const promise = mod.createBackup("r2stream")
    await new Promise((r) => setTimeout(r, 30))
    child.stdout.write("CREATE TABLE t (id INT);\n")
    child.stdout.end()
    child.emit("close", 0)

    const res = await promise
    expect(res.cloud).toBe(true)
    expect(uploadedIsBuffer).toBe(false)
    expect(uploadedText).toBe("CREATE TABLE t (id INT);\n")
    expect(uploadedLength).toBe(res.size)
  })

  it("readBackupFile streams R2 download to .tmp then renames atomically, and cleans .tmp on mid-stream error", async () => {
    storageMocks.downloadFromCloudStream.mockResolvedValueOnce(
      Readable.from(["-- cloud line 1\n", "-- cloud line 2\n"]),
    )

    const ok = await mod.readBackupFile("backup-20261118-010203-aaaa1111.sql")
    expect(readFileSync(ok.path, "utf8")).toBe("-- cloud line 1\n-- cloud line 2\n")
    expect(readdirSync(backupDir)).toEqual(["backup-20261118-010203-aaaa1111.sql"])

    // Simulate stream failure mid-download: must NOT mask as missing file and must clean .tmp
    storageMocks.downloadFromCloudStream.mockImplementationOnce(async () => {
      const s = new PassThrough()
      setTimeout(() => {
        s.write("-- partial")
        s.destroy(new Error("R2 socket reset"))
      }, 20)
      return s
    })

    await expect(mod.readBackupFile("backup-20261118-010203-bbbb2222.sql")).rejects.toThrow(
      /R2 socket reset/,
    )
    expect(readdirSync(backupDir)).toEqual(["backup-20261118-010203-aaaa1111.sql"])
  })

  it("restoreBackup attaches stream error listeners and handles mysql early exit EPIPE cleanly", async () => {
    mkdirSync(backupDir, { recursive: true })
    const filename = "backup-20261118-010203-cccc3333.sql"
    writeFileSync(path.join(backupDir, filename), "SELECT 1;\n".repeat(4096))

    const child = makeMockChild()
    spawnMock.mockReturnValue(child)

    const promise = mod.restoreBackup(filename)
    setTimeout(() => {
      const epipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" })
      child.stdin.destroy(epipe)
      child.stderr.write("ERROR 1045 (28000): Access denied")
      child.emit("close", 1)
    }, 20)

    await expect(promise).rejects.toThrow(/Restore gagal \(exit 1\): ERROR 1045/)
  })
})

describe("C1 + C2 + M1: Dockerfile, docker-compose.prod.yml, and CI guards", () => {
  const root = process.cwd()
  const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")

  it("Dockerfile keeps migrate CLI + generated .prisma/client and installs mysql-client + writable dirs", () => {
    const df = read("Dockerfile")
    expect(df).not.toContain("pnpm install --frozen-lockfile --prod")
    expect(df).toContain("AS migrate")
    expect(df).toContain("AS runner")
    expect(df).toContain("mysql-client")
    expect(df).toContain("/app/backups")
    expect(df).toContain("/app/private/uploads")
    expect(df).toContain("chown -R nextjs:nodejs")
    // `.next/standalone` must be copied AFTER migrate node_modules so standalone's
    // generated `.prisma/client` symlink is never clobbered.
    expect(df.indexOf("COPY --from=migrate")).toBeLessThan(df.indexOf("/app/.next/standalone"))
  })

  it("docker-compose.prod.yml mounts backups and private/uploads volumes", () => {
    const compose = read("docker-compose.prod.yml")
    expect(compose).toContain("./backups:/app/backups")
    expect(compose).toContain("./private/uploads:/app/private/uploads")
    expect(compose).toContain("./public/uploads:/app/public/uploads")
  })

  it("ci.yml triggers Docker job on pnpm lock/workspace changes and smoke-tests Prisma + mysql-client", () => {
    const ci = read(".github/workflows/ci.yml")
    expect(ci).toContain("pnpm-lock\\.yaml")
    expect(ci).toContain("pnpm-workspace\\.yaml")
    expect(ci).toContain("@prisma/client")
    expect(ci).toContain("./node_modules/.bin/prisma")
    expect(ci).toContain("mysqldump")
    expect(ci).toContain("/app/backups")
    expect(ci).toContain("/app/private/uploads")
  })
})
