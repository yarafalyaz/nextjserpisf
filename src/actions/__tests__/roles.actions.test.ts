import { describe, it, expect, vi, beforeEach } from "vitest"

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const redirectMock = vi.fn()
const logActivityMock = vi.fn()

const roleCreateMock = vi.fn()
const roleUpdateMock = vi.fn()
const permissionFindManyMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    role: {
      create: (...a: unknown[]) => roleCreateMock(...a),
      update: (...a: unknown[]) => roleUpdateMock(...a),
    },
    permission: {
      findMany: (...a: unknown[]) => permissionFindManyMock(...a),
    },
  },
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidateMock(...a),
}))
vi.mock("next/navigation", () => ({
  // redirect() throws NEXT_REDIRECT in Next.js; emulate so success paths bail
  // out exactly where the real action would.
  redirect: (...a: unknown[]) => {
    redirectMock(...a)
    const e = new Error("NEXT_REDIRECT")
    ;(e as unknown as { digest: string }).digest = "NEXT_REDIRECT;replace;/pengaturan/peran;307"
    throw e
  },
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("@/lib/utils/error", () => ({
  getErrorMessage: (e: unknown, fallback?: string) =>
    e instanceof Error ? e.message : fallback ?? "error",
  isNextRedirectError: (e: unknown) =>
    e instanceof Error && (e as unknown as { digest?: string }).digest?.startsWith("NEXT_REDIRECT") === true,
}))

import { createRole, updateRole } from "../roles.actions"

function fd(entries: Record<string, string | string[]>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x))
    else f.set(k, v)
  }
  return f
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, redirectMock, logActivityMock,
    roleCreateMock, roleUpdateMock, permissionFindManyMock,
  ]) m.mockReset()
  roleCreateMock.mockResolvedValue({ id: 1 })
  roleUpdateMock.mockResolvedValue({ id: 1 })
  // Default actor: holds manage_settings only, NOT super_admin.
  requirePermissionMock.mockResolvedValue({
    id: "1",
    roles: ["admin"],
    permissions: ["manage_settings"],
  })
})

describe("createRole least-privilege guard", () => {
  it("blocks attaching a permission the actor does not hold", async () => {
    // Requested perm id 5 resolves to manage_users, which the actor lacks.
    permissionFindManyMock.mockResolvedValue([{ name: "manage_users" }])
    await expect(
      createRole(fd({ name: "Sneaky", permissions: ["5"] })),
    ).rejects.toThrow(/tidak Anda miliki/)
    expect(roleCreateMock).not.toHaveBeenCalled()
  })

  it("allows attaching permissions the actor already holds", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "1",
      roles: ["admin"],
      permissions: ["manage_settings", "view_items"],
    })
    permissionFindManyMock.mockResolvedValue([{ name: "view_items" }])
    // Success path ends in redirect() which throws NEXT_REDIRECT.
    await expect(
      createRole(fd({ name: "Viewer", permissions: ["9"] })),
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(roleCreateMock).toHaveBeenCalled()
    expect(redirectMock).toHaveBeenCalledWith("/pengaturan/peran")
  })

  it("lets a super_admin attach any permission without a lookup", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "1",
      roles: ["super_admin"],
      permissions: [],
    })
    await expect(
      createRole(fd({ name: "Power", permissions: ["5"] })),
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(permissionFindManyMock).not.toHaveBeenCalled()
    expect(roleCreateMock).toHaveBeenCalled()
  })
})

describe("updateRole least-privilege guard", () => {
  it("blocks attaching a permission the actor does not hold", async () => {
    permissionFindManyMock.mockResolvedValue([{ name: "approve_workflows" }])
    await expect(
      updateRole(3, fd({ name: "Sneaky", permissions: ["7"] })),
    ).rejects.toThrow(/tidak Anda miliki/)
    expect(roleUpdateMock).not.toHaveBeenCalled()
  })

  it("allows attaching permissions the actor already holds", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "1",
      roles: ["admin"],
      permissions: ["manage_settings", "view_items"],
    })
    permissionFindManyMock.mockResolvedValue([{ name: "view_items" }])
    await expect(
      updateRole(3, fd({ name: "Viewer", permissions: ["9"] })),
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(roleUpdateMock).toHaveBeenCalled()
  })
})
