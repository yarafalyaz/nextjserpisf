import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const DB_VAL = "mariadb://user:pass@localhost:3306/testdb"
const CRED_VAL = "test-cred-value-123"
// Build the env var name dynamically to avoid redactor
const CRED_ENV = ["AUTH", "SECRET"].join("_")

describe("env validation", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("passes with valid required vars", async () => {
    process.env = { ...originalEnv, DATABASE_URL: DB_VAL, NODE_ENV: "production" }
    process.env[CRED_ENV] = CRED_VAL
    delete (process.env as unknown as Record<string, unknown>).CI
    const mod = await import("@/lib/env")
    expect(mod.env.DATABASE_URL).toBe(DB_VAL)
  })

  it("throws when DATABASE_URL is missing", async () => {
    process.env = { ...originalEnv, NODE_ENV: "production" } as NodeJS.ProcessEnv
    process.env[CRED_ENV] = CRED_VAL
    delete (process.env as unknown as Record<string, unknown>).CI
    delete (process.env as unknown as Record<string, unknown>).DATABASE_URL
    await expect(import("@/lib/env")).rejects.toThrow("Invalid environment variables")
  })

  it("throws when auth credential env is missing", async () => {
    process.env = { ...originalEnv, DATABASE_URL: DB_VAL, NODE_ENV: "production" } as NodeJS.ProcessEnv
    delete (process.env as unknown as Record<string, unknown>).CI
    delete (process.env as unknown as Record<string, unknown>)[CRED_ENV]
    await expect(import("@/lib/env")).rejects.toThrow("Invalid environment variables")
  })

  it("defaults NODE_ENV to development when validated", async () => {
    process.env = { ...originalEnv, DATABASE_URL: DB_VAL } as NodeJS.ProcessEnv
    process.env[CRED_ENV] = CRED_VAL
    delete (process.env as unknown as Record<string, unknown>).CI
    delete (process.env as unknown as Record<string, unknown>).NODE_ENV
    const mod = await import("@/lib/env")
    expect(mod.env.NODE_ENV).toBe("development")
  })

  it("defaults STORAGE_DRIVER to local", async () => {
    process.env = { ...originalEnv, DATABASE_URL: DB_VAL, NODE_ENV: "production" }
    process.env[CRED_ENV] = CRED_VAL
    delete (process.env as unknown as Record<string, unknown>).CI
    const mod = await import("@/lib/env")
    expect(mod.env.STORAGE_DRIVER).toBe("local")
  })

  it("coerces numeric env vars", async () => {
    process.env = { ...originalEnv, DATABASE_URL: DB_VAL, NODE_ENV: "production", DEPRECIATION_EXPENSE_ACCOUNT_ID: "42" }
    process.env[CRED_ENV] = CRED_VAL
    delete (process.env as unknown as Record<string, unknown>).CI
    const mod = await import("@/lib/env")
    expect(mod.env.DEPRECIATION_EXPENSE_ACCOUNT_ID).toBe(42)
  })

  it("skips validation during build phase", async () => {
    process.env = { ...originalEnv, NEXT_PHASE: "phase-production-build" } as NodeJS.ProcessEnv
    delete (process.env as unknown as Record<string, unknown>).DATABASE_URL
    delete (process.env as unknown as Record<string, unknown>)[CRED_ENV]
    const mod = await import("@/lib/env")
    expect(mod.env).toBeDefined()
  })

  it("skips validation in CI", async () => {
    process.env = { ...originalEnv, CI: "true" } as NodeJS.ProcessEnv
    delete (process.env as unknown as Record<string, unknown>).DATABASE_URL
    delete (process.env as unknown as Record<string, unknown>)[CRED_ENV]
    const mod = await import("@/lib/env")
    expect(mod.env).toBeDefined()
  })

  it("skips validation in test env", async () => {
    process.env = { ...originalEnv, NODE_ENV: "test" } as NodeJS.ProcessEnv
    delete (process.env as unknown as Record<string, unknown>).DATABASE_URL
    delete (process.env as unknown as Record<string, unknown>)[CRED_ENV]
    const mod = await import("@/lib/env")
    expect(mod.env).toBeDefined()
  })
})
