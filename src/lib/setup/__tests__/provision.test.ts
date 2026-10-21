import { describe, it, expect, vi } from "vitest"

const mockBinExists = vi.hoisted(() => ({ current: true }))
const mockExec = vi.hoisted(() => ({
  current: { error: null as Error | null, stdout: "", stderr: "" },
}))

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return { ...actual, existsSync: () => mockBinExists.current }
})

vi.mock("node:child_process", () => {
  const execFile = (
    _file: string,
    _args: string[],
    _options: unknown,
    callback: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    const { error, stdout, stderr } = mockExec.current
    if (error) {
      const err = error as Error & { stdout: string; stderr: string }
      err.stdout = stdout
      err.stderr = stderr
      callback(err, stdout, stderr)
    } else {
      callback(null, stdout, stderr)
    }
  }
  // provision.ts memakai promisify(execFile); Node menempelkan implementasi
  // promise-nya sendiri lewat simbol ini, jadi mock harus menirunya.
  const custom = () => {
    const { error, stdout, stderr } = mockExec.current
    if (error) {
      const err = error as Error & { stdout: string; stderr: string }
      err.stdout = stdout
      err.stderr = stderr
      return Promise.reject(err)
    }
    return Promise.resolve({ stdout, stderr })
  }
  Object.defineProperty(execFile, Symbol.for("nodejs.util.promisify.custom"), { value: custom })
  return { execFile }
})

import { getSetupChecks, provisionSchema } from "../provision"

function fakeDb(opts: { connectError?: boolean; tables?: string[]; tablesError?: boolean }) {
  return {
    $queryRaw: async () => {
      if (opts.connectError) throw new Error("unreachable")
      return [{ "?column?": 1 }]
    },
    $queryRawUnsafe: async () => {
      if (opts.tablesError) throw new Error("no catalog")
      return (opts.tables ?? []).map((name) => ({ name }))
    },
  } as never
}

describe("getSetupChecks", () => {
  it("melaporkan tidak terhubung bila SELECT 1 gagal", async () => {
    const checks = await getSetupChecks(fakeDb({ connectError: true }))
    expect(checks).toEqual({ databaseConnected: false, schemaReady: false, tableCount: 0 })
  })

  it("melaporkan skema belum siap bila tabel inti belum ada", async () => {
    const checks = await getSetupChecks(fakeDb({ tables: ["migrations_something"] }))
    expect(checks.databaseConnected).toBe(true)
    expect(checks.schemaReady).toBe(false)
    expect(checks.tableCount).toBe(1)
  })

  it("melaporkan skema siap bila semua tabel inti ada", async () => {
    const checks = await getSetupChecks(
      fakeDb({ tables: ["users", "roles", "permissions", "system_settings", "items"] }),
    )
    expect(checks.schemaReady).toBe(true)
    expect(checks.tableCount).toBe(5)
  })

  it("menganggap skema belum siap bila katalog tidak terbaca", async () => {
    const checks = await getSetupChecks(fakeDb({ tablesError: true }))
    expect(checks).toEqual({ databaseConnected: true, schemaReady: false, tableCount: 0 })
  })
})

describe("provisionSchema", () => {
  it("gagal jujur bila Prisma CLI tidak tersedia", async () => {
    mockBinExists.current = false
    const result = await provisionSchema()
    expect(result.success).toBe(false)
    expect(result.message).toContain("prisma migrate deploy")
    mockBinExists.current = true
  })

  it("berhasil bila migrate deploy keluar bersih", async () => {
    mockExec.current = { error: null, stdout: "All migrations applied", stderr: "" }
    const result = await provisionSchema()
    expect(result.success).toBe(true)
    expect(result.message).toContain("All migrations applied")
  })

  it("meneruskan keluaran migrasi yang gagal", async () => {
    mockExec.current = { error: new Error("exit 1"), stdout: "", stderr: "P3018 migration failed" }
    const result = await provisionSchema()
    expect(result.success).toBe(false)
    expect(result.message).toContain("P3018")
    mockExec.current = { error: null, stdout: "", stderr: "" }
  })
})
