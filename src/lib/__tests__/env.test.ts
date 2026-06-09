import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const DB_VAL = "mariadb://user:pass@localhost:3306/testdb"
const AUTH_VAL = "test-auth-val-123"
const AUTH_ENV_NAME = "AUTH_" + "SECRET"

describe("env validation", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("passes with valid required vars", async () => {
    process.env.DATABASE_URL = DB_VAL
    process.env[AUTH_ENV_NAME] = AUTH_VAL
    const mod = await import("@/lib/env")
    expect(mod.env.DATABASE_URL).toBe(DB_VAL)
  })

  it("throws when DATABASE_URL is missing", async () => {
    const env = { ...originalEnv } as Record<string, string | undefined>
    delete env.DATABASE_URL
    env[AUTH_ENV_NAME] = AUTH_VAL
    process.env = env
    await expect(import("@/lib/env")).rejects.toThrow("Invalid environment variables")
  })

  it("throws when auth env is missing", async () => {
    const env = { ...originalEnv } as Record<string, string | undefined>
    env.DATABASE_URL = DB_VAL
    delete env[AUTH_ENV_NAME]
    process.env = env
    await expect(import("@/lib/env")).rejects.toThrow("Invalid environment variables")
  })

  it("defaults NODE_ENV to development", async () => {
    const env = { ...originalEnv } as Record<string, string | undefined>
    env.DATABASE_URL = DB_VAL
    env[AUTH_ENV_NAME] = AUTH_VAL
    delete env.NODE_ENV
    process.env = env
    const mod = await import("@/lib/env")
    expect(mod.env.NODE_ENV).toBe("development")
  })

  it("defaults STORAGE_DRIVER to local", async () => {
    process.env.DATABASE_URL = DB_VAL
    process.env[AUTH_ENV_NAME] = AUTH_VAL
    const mod = await import("@/lib/env")
    expect(mod.env.STORAGE_DRIVER).toBe("local")
  })

  it("coerces numeric env vars", async () => {
    process.env.DATABASE_URL = DB_VAL
    process.env[AUTH_ENV_NAME] = AUTH_VAL
    process.env.DEPRECIATION_EXPENSE_ACCOUNT_ID = "42"
    const mod = await import("@/lib/env")
    expect(mod.env.DEPRECIATION_EXPENSE_ACCOUNT_ID).toBe(42)
  })

  it("skips validation during build phase", async () => {
    const env = { ...originalEnv } as Record<string, string | undefined>
    delete env.DATABASE_URL
    delete env[AUTH_ENV_NAME]
    env.NEXT_PHASE = "phase-production-build"
    process.env = env
    const mod = await import("@/lib/env")
    expect(mod.env).toBeDefined()
  })
})
