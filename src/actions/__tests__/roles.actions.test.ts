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
const roleDeleteMock = vi.fn()
const roleFindUniqueMock = vi.fn()
const approvalWorkflowStepCountMock = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    role: {
      create: (...a: unknown[]) => roleCreateMock(...a),
      update: (...a: unknown[]) => roleUpdateMock(...a),
      delete: (...a: unknown[]) => roleDeleteMock(...a),
      findUnique: (...a: unknown[]) => roleFindUniqueMock(...a),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    permission: {
      findMany: (...a: unknown[]) => permissionFindManyMock(...a),
    },
    approvalWorkflowStep: {
      count: (...a: unknown[]) => approvalWorkflowStepCountMock(...a),
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

import { createRole, updateRole, deleteRole } from "../roles.actions"

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
    roleDeleteMock, roleFindUniqueMock, approvalWorkflowStepCountMock,
  ]) m.mockReset()
  approvalWorkflowStepCountMock.mockResolvedValue(0)
  roleCreateMock.mockResolvedValue({ id: 1 })
  roleUpdateMock.mockResolvedValue({ id: 1 })
  // Default actor: holds manage_settings only, NOT super_admin.
  requirePermissionMock.mockResolvedValue({
    id: "1",
    roles: ["admin"],
    permissions: ["manage_settings"],
  })
})

describe("createRole validation", () => {
  it("mengembalikan pesan error (bukan melempar) saat validasi skema gagal", async () => {
    // Kontrak form: kegagalan yang bisa diperbaiki pengguna dikembalikan sebagai
    // { success: false, error } supaya tampil inline dan isian form tidak hilang.
    const result = await createRole(fd({}))
    expect(result).toMatchObject({ success: false })
    expect((result as { error: string }).error).toBeTruthy()
    expect(roleCreateMock).not.toHaveBeenCalled()
  })

  it("menolak nama peran yang dicadangkan sistem", async () => {
    // Tanpa penjagaan ini, pemegang pengelolaan peran bisa membuat ulang role
    // bernama "super_admin"/"admin" dan langsung mendapat akses lintas-cakupan.
    requirePermissionMock.mockResolvedValue({ id: "1", roles: ["super_admin"], permissions: [] })
    await expect(createRole(fd({ name: "super_admin" }))).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/dicadangkan/),
    })
    await expect(createRole(fd({ name: "logistics" }))).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/dicadangkan/),
    })
    expect(roleCreateMock).not.toHaveBeenCalled()
  })
})

describe("createRole least-privilege guard", () => {
  it("blocks attaching a permission the actor does not hold", async () => {
    // Requested perm id 5 resolves to manage_users, which the actor lacks.
    permissionFindManyMock.mockResolvedValue([{ name: "manage_users" }])
    await expect(
      createRole(fd({ name: "Sneaky", permissions: ["5"] })),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/tidak Anda miliki/),
    })
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

describe("role permissionIds validation", () => {
  it("createRole menolak ID izin non-integer tanpa tulis", async () => {
    requirePermissionMock.mockResolvedValue({ id: "1", roles: ["super_admin"], permissions: [] })
    const res = await createRole(fd({ name: "Viewer", permissions: ["9", "abc"] }))
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/permissions/) })
    expect(roleCreateMock).not.toHaveBeenCalled()
  })
  it("createRole menolak ID izin negatif/desimal tanpa tulis", async () => {
    requirePermissionMock.mockResolvedValue({ id: "1", roles: ["super_admin"], permissions: [] })
    for (const bad of ["-5", "2.5", "0"]) {
      const res = await createRole(fd({ name: "Viewer", permissions: [bad] }))
      expect(res).toMatchObject({ success: false })
    }
    expect(roleCreateMock).not.toHaveBeenCalled()
  })
  it("updateRole menolak ID izin rusak tanpa tulis", async () => {
    requirePermissionMock.mockResolvedValue({ id: "1", roles: ["super_admin"], permissions: [] })
    const res = await updateRole(3, fd({ name: "Viewer", permissions: ["x"] }))
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/permissions/) })
    expect(roleUpdateMock).not.toHaveBeenCalled()
  })
  it("createRole dedup ID izin ganda", async () => {
    requirePermissionMock.mockResolvedValue({ id: "1", roles: ["super_admin"], permissions: [] })
    await expect(createRole(fd({ name: "Viewer", permissions: ["9", "9"] }))).rejects.toThrow("NEXT_REDIRECT")
    expect(roleCreateMock.mock.calls.at(-1)?.[0]?.data?.permissions?.connect).toEqual([{ id: 9 }])
  })
})

describe("updateRole validation", () => {
  it("mengembalikan pesan error (bukan melempar) saat validasi skema gagal", async () => {
    const result = await updateRole(3, fd({}))
    expect(result).toMatchObject({ success: false })
    expect((result as { error: string }).error).toBeTruthy()
    expect(roleUpdateMock).not.toHaveBeenCalled()
  })
})

describe("updateRole least-privilege guard", () => {
  it("blocks attaching a permission the actor does not hold", async () => {
    permissionFindManyMock.mockResolvedValue([{ name: "approve_workflows" }])
    await expect(
      updateRole(3, fd({ name: "Sneaky", permissions: ["7"] })),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/tidak Anda miliki/),
    })
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

describe("updateRole slug", () => {
  const allowAll = () => {
    requirePermissionMock.mockResolvedValue({
      id: "1",
      roles: ["admin"],
      permissions: ["manage_settings", "view_items"],
    })
    permissionFindManyMock.mockResolvedValue([{ name: "view_items" }])
  }

  it("tidak menghitung ulang slug saat hanya daftar izin yang berubah", async () => {
    allowAll()
    roleFindUniqueMock.mockResolvedValue({ name: "Viewer" })
    await expect(
      updateRole(3, fd({ name: "Viewer", permissions: ["9"] })),
    ).rejects.toThrow("NEXT_REDIRECT")
    const data = roleUpdateMock.mock.calls.at(-1)?.[0]?.data
    // Regresi: menyimpan izin dari matriks tidak boleh mengubah URL peran.
    expect(data.slug).toBeUndefined()
    expect(data.permissions.set).toEqual([{ id: 9 }])
  })

  it("menghitung ulang slug saat nama peran benar-benar berubah", async () => {
    allowAll()
    roleFindUniqueMock.mockResolvedValue({ name: "Lama" })
    await expect(
      updateRole(3, fd({ name: "Baru", permissions: ["9"] })),
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(roleUpdateMock.mock.calls.at(-1)?.[0]?.data.slug).toBe("baru")
  })
})

describe("deleteRole", () => {
  it("throws error when role not found", async () => {
    roleFindUniqueMock.mockResolvedValue(null)
    await expect(deleteRole(99)).rejects.toThrow("Role tidak ditemukan")
    expect(roleDeleteMock).not.toHaveBeenCalled()
  })

  it("throws error when role is still in use by users", async () => {
    roleFindUniqueMock.mockResolvedValue({
      id: 1,
      name: "Staff",
      users: [{ id: 101 }],
    })
    await expect(deleteRole(1)).rejects.toThrow(/masih digunakan/)
    expect(roleDeleteMock).not.toHaveBeenCalled()
  })

  it("throws error when role is still referenced by approval workflow steps", async () => {
    roleFindUniqueMock.mockResolvedValue({ id: 1, name: "Staff", users: [] })
    approvalWorkflowStepCountMock.mockResolvedValue(2)
    await expect(deleteRole(1)).rejects.toThrow(/langkah persetujuan/)
    expect(approvalWorkflowStepCountMock).toHaveBeenCalledWith({ where: { roleId: 1 } })
    expect(roleDeleteMock).not.toHaveBeenCalled()
  })

  it("deletes role and redirects on success", async () => {
    roleFindUniqueMock.mockResolvedValue({
      id: 1,
      name: "Staff",
      users: [],
    })
    roleDeleteMock.mockResolvedValue({})

    await expect(deleteRole(1)).rejects.toThrow("NEXT_REDIRECT")
    expect(roleDeleteMock).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(revalidateMock).toHaveBeenCalledWith("/pengaturan/peran")
    expect(logActivityMock).toHaveBeenCalledWith("delete", "Role", 1, "Menghapus peran")
    expect(redirectMock).toHaveBeenCalledWith("/pengaturan/peran")
  })
})

describe("super_admin role protection", () => {
  it("updateRole refuses to edit super_admin when actor is not super_admin", async () => {
    // Resolve the target role as super_admin
    roleFindUniqueMock.mockResolvedValue({ id: 1, name: "super_admin", users: [] })
    // Actor: manage_settings holder, NOT super_admin
    requirePermissionMock.mockResolvedValue({
      id: "1",
      roles: ["admin"],
      permissions: ["manage_settings"],
    })
    await expect(
      updateRole(1, fd({ name: "still-super" })),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/super_admin/i),
    })
    expect(roleUpdateMock).not.toHaveBeenCalled()
  })

  it("updateRole lets a super_admin actor edit super_admin", async () => {
    roleFindUniqueMock.mockResolvedValue({ id: 1, name: "super_admin", users: [] })
    requirePermissionMock.mockResolvedValue({
      id: "1",
      roles: ["super_admin"],
      permissions: ["manage_settings"],
    })
    permissionFindManyMock.mockResolvedValue([])
    await expect(
      updateRole(1, fd({ name: "still-super" })),
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(roleUpdateMock).toHaveBeenCalled()
  })

  it("deleteRole refuses to delete super_admin for any non-super_admin caller", async () => {
    roleFindUniqueMock.mockResolvedValue({ id: 1, name: "super_admin", users: [] })
    requirePermissionMock.mockResolvedValue({
      id: "1",
      roles: ["admin"],
      permissions: ["manage_settings"],
    })
    await expect(deleteRole(1)).rejects.toThrow(/super_admin/i)
    expect(roleDeleteMock).not.toHaveBeenCalled()
  })
})

