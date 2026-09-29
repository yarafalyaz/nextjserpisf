import { beforeEach, describe, expect, it, vi } from "vitest"
import { toggleModuleAccess } from "../module-access.actions"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  roleFindUnique: vi.fn(),
  moduleActionFindUnique: vi.fn(),
  roleModuleAccessUpsert: vi.fn(),
  revalidatePath: vi.fn(),
  logActivity: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...args: unknown[]) => mocks.requirePermission(...args),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    role: { findUnique: (...args: unknown[]) => mocks.roleFindUnique(...args) },
    moduleAction: { findUnique: (...args: unknown[]) => mocks.moduleActionFindUnique(...args) },
    roleModuleAccess: { upsert: (...args: unknown[]) => mocks.roleModuleAccessUpsert(...args) },
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args) }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: (...args: unknown[]) => mocks.logActivity(...args) }))

function form(entries: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

describe("toggleModuleAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 1, roles: ["admin"] })
    mocks.roleFindUnique.mockResolvedValue({ name: "staff" })
    mocks.moduleActionFindUnique.mockResolvedValue({ moduleId: 2 })
    mocks.roleModuleAccessUpsert.mockResolvedValue({})
    mocks.logActivity.mockResolvedValue(undefined)
  })

  it("ignores an external return target", async () => {
    await toggleModuleAccess(form({ roleId: "3", moduleActionId: "4", allowed: "1", returnTo: "https://attacker.test" }))

    expect(mocks.roleModuleAccessUpsert).toHaveBeenCalledOnce()
  })

  it("rejects non-integer identifiers", async () => {
    await expect(toggleModuleAccess(form({ roleId: "3.5", moduleActionId: "4", allowed: "1" }))).rejects.toThrow("Parameter tidak valid")
    expect(mocks.roleModuleAccessUpsert).not.toHaveBeenCalled()
  })
})
