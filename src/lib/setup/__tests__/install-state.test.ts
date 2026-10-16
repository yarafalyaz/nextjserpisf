import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({ count: vi.fn() }))
vi.mock("@/lib/db/prisma", () => ({ basePrisma: { user: { count: mocks.count } } }))

import { isInstalled } from "../install-state"

describe("isInstalled", () => {
  beforeEach(() => {
    mocks.count.mockReset()
  })

  it("is true when at least one user exists", async () => {
    mocks.count.mockResolvedValue(1)
    await expect(isInstalled()).resolves.toBe(true)
  })

  it("is false when there are no users", async () => {
    mocks.count.mockResolvedValue(0)
    await expect(isInstalled()).resolves.toBe(false)
  })

  it("is false (not a crash) when the schema is missing", async () => {
    mocks.count.mockRejectedValue(new Error("Table 'users' does not exist in the current database"))
    await expect(isInstalled()).resolves.toBe(false)
  })
})
