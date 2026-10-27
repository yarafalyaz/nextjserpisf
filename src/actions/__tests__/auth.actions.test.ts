import { describe, it, expect, vi, beforeEach } from "vitest"

const signInMock = vi.fn()
const signOutMock = vi.fn()
const requireAuthMock = vi.fn()
const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()

const userFindMock = vi.fn()
const userFindUniqueMock = vi.fn()
const userCreateMock = vi.fn()
const userUpdateMock = vi.fn()
const roleFindManyMock = vi.fn()
const warehouseCountMock = vi.fn()
const userCountMock = vi.fn()

const bcryptCompareMock = vi.fn()
const bcryptHashMock = vi.fn()

vi.mock("@/lib/auth/auth", () => ({
  signIn: (...a: unknown[]) => signInMock(...a),
  signOut: (...a: unknown[]) => signOutMock(...a),
}))
vi.mock("@/lib/auth/permissions", () => ({
  requireAuth: (...a: unknown[]) => requireAuthMock(...a),
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: (...a: unknown[]) => userFindMock(...a),
      findUnique: (...a: unknown[]) => userFindUniqueMock(...a),
      create: (...a: unknown[]) => userCreateMock(...a),
      update: (...a: unknown[]) => userUpdateMock(...a),
      count: (...a: unknown[]) => userCountMock(...a),
    },
    role: {
      findMany: (...a: unknown[]) => roleFindManyMock(...a),
    },

    warehouse: {
      count: (...a: unknown[]) => warehouseCountMock(...a),
    },
  },
}))

vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))

vi.mock("bcryptjs", () => ({
  default: {
    compare: (...a: unknown[]) => bcryptCompareMock(...a),
    hash: (...a: unknown[]) => bcryptHashMock(...a),
  },
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidateMock(...a),
}))
const logActivityMock = vi.fn()
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))

import {
  loginAction,
  logoutAction,
  changePassword,
  createUser,
  updateUserRoles,
  toggleUserActive,
  updateUserWarehouses,
  updateProfile,
} from "../auth.actions"

const SECRET_KEY = "currentPassword"
const NEW_KEY = "newPassword"

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
    signInMock, signOutMock, requireAuthMock, requirePermissionMock,
    revalidateMock, userFindMock, userFindUniqueMock, userCreateMock, userUpdateMock,
    roleFindManyMock, warehouseCountMock, userCountMock, bcryptCompareMock, bcryptHashMock,
  ]) m.mockReset()
  bcryptHashMock.mockResolvedValue("hashed-value")
  // requirePermission resolves to the acting user (default: a plain admin
  // holding manage_users but NOT super_admin). The privesc guard reads .roles.
  requirePermissionMock.mockResolvedValue({ id: "1", roles: ["admin"], permissions: ["manage_users"] })
  // No requested role is super_admin by default.
  roleFindManyMock.mockResolvedValue([])
  // Default target user has no roles (for assertCanModifyTarget).
  userFindUniqueMock.mockResolvedValue({ id: 3, roles: [] })
})

describe("loginAction", () => {
  it("rejects missing credentials before calling signIn", async () => {
    const res = await loginAction(fd({ email: "" }))
    expect(res).toEqual({ error: "Email dan password wajib diisi" })
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("returns success on valid sign in", async () => {
    signInMock.mockResolvedValue(undefined)
    const res = await loginAction(fd({ email: "a@b.c", password: "secretval" }))
    expect(res).toEqual({ success: true })
    expect(signInMock).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({ redirect: false }),
    )
  })

  it("maps a signIn failure to a generic error (no info leak)", async () => {
    signInMock.mockRejectedValue(new Error("CredentialsSignin"))
    const res = await loginAction(fd({ email: "a@b.c", password: "wrongval" }))
    expect(res).toEqual({ error: "Email atau password salah" })
  })
})

describe("logoutAction", () => {
  it("signs out and revalidates", async () => {
    signOutMock.mockResolvedValue(undefined)
    await logoutAction()
    expect(signOutMock).toHaveBeenCalledWith({ redirect: false })
    expect(revalidateMock).toHaveBeenCalledWith("/")
  })

  it("swallows signOut errors (expired session)", async () => {
    signOutMock.mockRejectedValue(new Error("expired"))
    await expect(logoutAction()).resolves.toBeUndefined()
  })
})

describe("changePassword", () => {
  beforeEach(() => requireAuthMock.mockResolvedValue({ id: "7" }))

  it("requires both fields", async () => {
    const res = await changePassword(fd({ [SECRET_KEY]: "" }))
    // New Zod-based validation reports the first missing field ("Password
    // lama wajib diisi") rather than the legacy combined string.
    expect(res).toEqual({ error: "Password lama wajib diisi" })
  })

  it("enforces minimum length on the new value", async () => {
    const res = await changePassword(fd({ [SECRET_KEY]: "oldvalue1", [NEW_KEY]: "short" }))
    expect(res).toEqual({ error: "Password baru minimal 12 karakter" })
  })

  it("rejects an 8-11 char new password and a common one", async () => {
    const short = await changePassword(fd({ [SECRET_KEY]: "oldvalue1", [NEW_KEY]: "delapan12" }))
    expect(short).toEqual({ error: "Password baru minimal 12 karakter" })
    const common = await changePassword(fd({ [SECRET_KEY]: "oldvalue1", [NEW_KEY]: "administrator" }))
    expect(common).toEqual({ error: "Password terlalu umum, gunakan kata sandi lain" })
  })

  it("rejects when the old value does not match", async () => {
    userFindMock.mockResolvedValue({ id: 7, password: "stored-hash" })
    bcryptCompareMock.mockResolvedValue(false)
    const res = await changePassword(fd({ [SECRET_KEY]: "oldvalue1", [NEW_KEY]: "brandnewvalue12" }))
    expect(res).toEqual({ error: "Password lama salah" })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("uses the session user id, never formData (IDOR guard)", async () => {
    userFindMock.mockResolvedValue({ id: 7, password: "stored-hash" })
    bcryptCompareMock.mockResolvedValue(true)
    userUpdateMock.mockResolvedValue({ id: 7 })
    const res = await changePassword(
      fd({ [SECRET_KEY]: "oldvalue1", [NEW_KEY]: "brandnewvalue12", userId: "999" }),
    )
    expect(res).toEqual({ success: true })
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    )
  })

  it("returns generic error on exception", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    userFindMock.mockRejectedValue(new Error("DB Connection Error"))
    const res = await changePassword(fd({ [SECRET_KEY]: "oldvalue1", [NEW_KEY]: "brandnewvalue12" }))
    expect(res).toEqual({ error: "Terjadi kesalahan saat mengubah password" })
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

describe("createUser", () => {
  it("enforces the manage_users guard before creating", async () => {
    userCreateMock.mockResolvedValue({ id: 1 })
    await createUser(fd({ name: "X", email: "x@y.z", password: "kata-sandi-baru-kuat" }))
    expect(requirePermissionMock).toHaveBeenCalledWith("manage_users")
  })

  it("records an audit-trail entry for user creation", async () => {
    userCreateMock.mockResolvedValue({ id: 12 })
    await createUser(fd({ name: "X", email: "x@y.z", password: "kata-sandi-baru-kuat", roleIds: ["1", "2"] }))
    expect(logActivityMock).toHaveBeenCalledWith(
      "create",
      "User",
      12,
      expect.stringContaining("x@y.z"),
    )
  })

  it("requires name, email, and password", async () => {
    const res = await createUser(fd({ name: "X" }))
    // New Zod-based validation reports the first missing field rather than the
    // legacy combined "Nama, email, dan password wajib diisi" string. Both
    // email + password are missing; Zod reports email first.
    expect(res).toEqual({ error: "Email wajib diisi" })
  })

  it("hashes the password and connects roles", async () => {
    userCreateMock.mockResolvedValue({ id: 12 })
    const res = await createUser(
      fd({ name: "X", email: "x@y.z", password: "kata-sandi-baru-kuat", roleIds: ["1", "2"] }),
    )
    expect(res).toEqual({ success: true, id: 12 })
    expect(bcryptHashMock).toHaveBeenCalledWith("kata-sandi-baru-kuat", 12)
    const arg = userCreateMock.mock.calls[0][0]
    expect(arg.data.password).toBe("hashed-value")
    expect(arg.data.roles.connect).toEqual([{ id: 1 }, { id: 2 }])
  })

  it("maps a duplicate-email constraint to a friendly error", async () => {
    userCreateMock.mockRejectedValue(new Error("Unique constraint failed on email"))
    const res = await createUser(fd({ name: "X", email: "x@y.z", password: "kata-sandi-baru-kuat" }))
    expect(res).toEqual({ error: "Email sudah terdaftar" })
  })

  it("enforces minimum password length", async () => {
    const res = await createUser(fd({ name: "X", email: "x@y.z", password: "short" }))
    expect(res).toEqual({ error: "Password minimal 12 karakter" })
  })

  it("rejects a common password at sufficient length", async () => {
    const res = await createUser(fd({ name: "X", email: "x@y.z", password: "administrator" }))
    expect(res).toEqual({ error: "Password terlalu umum, gunakan kata sandi lain" })
  })

  it("blocks privilege escalation if actor tries to grant super_admin", async () => {
    roleFindManyMock.mockResolvedValue([{ name: "super_admin" }])
    const res = await createUser(fd({ name: "X", email: "x@y.z", password: "kata-sandi-baru-kuat", roleIds: ["9"] }))
    expect(res).toEqual({ error: "Hanya super admin yang dapat memberikan role super admin" })
  })

  it("returns generic error on database exception", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    userCreateMock.mockRejectedValue(new Error("DB Down"))
    const res = await createUser(fd({ name: "X", email: "x@y.z", password: "kata-sandi-baru-kuat" }))
    expect(res).toEqual({ error: "Terjadi kesalahan saat membuat pengguna" })
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  // ==================== REGRESSION: Zod bypass hardening (createUser) ====================
  // The legacy createUser hand-parsed name/email/password via formData.get with
  // no format / length cap. An authenticated manage_users holder could push
  // (a) a non-email string ("not-an-email") — which would then collide on the
  // unique index with a confusing Prisma error, (b) a 5MB+ password blob (DoS
  // on bcrypt.hash), (c) a 5MB+ name (row persisted as a 5MB user.name in the
  // users table), (d) non-positive roleIds that would crash the .connect or
  // silently no-op. These cases assert the validator hard-fails AND the DB
  // was NOT called.
  describe("Zod bypass hardening (regression)", () => {
    it("rejects non-email string (was: passed straight to prisma)", async () => {
      const res = await createUser(
        fd({ name: "X", email: "not-an-email", password: "kata-sandi-baru-kuat" }),
      )
      expect(res).toEqual({ error: "Format email tidak valid" })
      expect(userCreateMock).not.toHaveBeenCalled()
    })

    it("rejects oversized password blob (was: 5MB bcrypt DoS)", async () => {
      const huge = "p".repeat(5000)
      const res = await createUser(
        fd({ name: "X", email: "x@y.z", password: huge }),
      )
      // 5000 chars is well over the 256-char schema cap.
      expect(res).toMatchObject({ error: expect.any(String) })
      expect(userCreateMock).not.toHaveBeenCalled()
    })

    it("rejects negative roleIds (was: silently no-op'd by .connect)", async () => {
      const res = await createUser(
        fd({ name: "X", email: "x@y.z", password: "kata-sandi-baru-kuat", roleIds: ["-1"] }),
      )
      expect(res).toMatchObject({ error: expect.any(String) })
      expect(userCreateMock).not.toHaveBeenCalled()
    })

    it("de-dupes duplicate roleIds", async () => {
      userCreateMock.mockResolvedValue({ id: 99 })
      const res = await createUser(
        fd({ name: "X", email: "x@y.z", password: "kata-sandi-baru-kuat", roleIds: ["1", "1", "2"] }),
      )
      expect(res).toEqual({ success: true, id: 99 })
      const arg = userCreateMock.mock.calls[0][0]
      expect(arg.data.roles.connect).toEqual([{ id: 1 }, { id: 2 }])
    })

    it("rejects malformed email like 'a@b' (no TLD)", async () => {
      const res = await createUser(
        fd({ name: "X", email: "a@b", password: "kata-sandi-baru-kuat" }),
      )
      expect(res).toEqual({ error: "Format email tidak valid" })
      expect(userCreateMock).not.toHaveBeenCalled()
    })
  })
})

describe("updateUserRoles", () => {
  it("requires manage_users and uses set semantics", async () => {
    userUpdateMock.mockResolvedValue({ id: 3 })
    const res = await updateUserRoles(3, [5, 6])
    expect(res).toEqual({ success: true })
    expect(requirePermissionMock).toHaveBeenCalledWith("manage_users")
    const arg = userUpdateMock.mock.calls[0][0]
    expect(arg.data.roles.set).toEqual([{ id: 5 }, { id: 6 }])
  })

  it("records an audit-trail entry with before/after roles", async () => {
    userUpdateMock.mockResolvedValue({ id: 3 })
    await updateUserRoles(3, [5, 6])
    expect(logActivityMock).toHaveBeenCalledWith(
      "update",
      "User",
      3,
      expect.stringContaining("5, 6"),
    )
  })

  it("blocks privilege escalation when permission is denied", async () => {
    requirePermissionMock.mockImplementation(async () => {
      throw new Error("nope")
    })
    const res = await updateUserRoles(3, [1])
    expect(res).toMatchObject({ error: expect.any(String) })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("blocks a non-super-admin from granting super_admin", async () => {
    // Actor holds manage_users but is NOT super_admin (beforeEach default).
    // Requested role id 9 resolves to super_admin.
    roleFindManyMock.mockResolvedValue([{ name: "super_admin" }])
    const res = await updateUserRoles(3, [9])
    expect(res).toMatchObject({ error: expect.any(String) })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("allows a super_admin actor to grant super_admin", async () => {
    requirePermissionMock.mockResolvedValue({ id: "1", roles: ["super_admin"], permissions: [] })
    userUpdateMock.mockResolvedValue({ id: 3 })
    const res = await updateUserRoles(3, [9])
    expect(res).toEqual({ success: true })
    // super_admin bypass: no role lookup needed.
    expect(roleFindManyMock).not.toHaveBeenCalled()
    expect(userUpdateMock).toHaveBeenCalled()
  })

  it("blocks a non-super-admin from altering an existing super_admin's roles", async () => {
    // Actor is a plain admin (beforeEach default). Target #3 IS a super_admin.
    userFindUniqueMock.mockResolvedValue({ id: 3, roles: [{ name: "super_admin" }] })
    const res = await updateUserRoles(3, [5])
    expect(res).toMatchObject({ error: expect.stringContaining("super admin") })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("returns error if target user is not found", async () => {
    userFindUniqueMock.mockResolvedValue(null)
    const res = await updateUserRoles(3, [5])
    expect(res).toEqual({ error: "Pengguna tidak ditemukan" })
  })

  it("allows a super_admin actor to alter another super_admin's roles", async () => {
    requirePermissionMock.mockResolvedValue({ id: "1", roles: ["super_admin"], permissions: [] })
    userFindUniqueMock.mockResolvedValue({ id: 3, roles: [{ name: "super_admin" }] })
    userUpdateMock.mockResolvedValue({ id: 3 })
    const res = await updateUserRoles(3, [5])
    expect(res).toEqual({ success: true })
    // super_admin bypass: target guard short-circuits without a target lookup.
    expect(userFindUniqueMock).not.toHaveBeenCalled()
    expect(userUpdateMock).toHaveBeenCalled()
  })

  it("blocks deactivating your own account", async () => {
    requirePermissionMock.mockResolvedValue({ id: "3", roles: ["admin"], permissions: ["manage_users"] })
    userFindUniqueMock.mockResolvedValue({ id: 3, roles: [] })
    const res = await toggleUserActive(3)
    expect(res).toEqual({ error: "Tidak dapat menonaktifkan akun sendiri" })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("blocks removing the last super_admin role from yourself", async () => {
    requirePermissionMock.mockResolvedValue({ id: "1", roles: ["super_admin"], permissions: [] })
    userFindUniqueMock.mockResolvedValue({ id: 1, roles: [{ name: "super_admin" }] })
    roleFindManyMock.mockResolvedValue([{ id: 1, name: "super_admin" }])
    userCountMock.mockResolvedValue(0)
    const res = await updateUserRoles(1, [5])
    expect(res).toEqual({ error: "Tidak dapat mencabut role super admin terakhir" })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("allows demoting yourself when another super_admin remains", async () => {
    requirePermissionMock.mockResolvedValue({ id: "1", roles: ["super_admin"], permissions: [] })
    userFindUniqueMock.mockResolvedValue({ id: 1, roles: [{ name: "super_admin" }] })
    roleFindManyMock.mockResolvedValue([{ id: 1, name: "super_admin" }])
    userCountMock.mockResolvedValue(2)
    userUpdateMock.mockResolvedValue({ id: 1 })
    const res = await updateUserRoles(1, [5])
    expect(res).toEqual({ success: true })
    expect(userUpdateMock).toHaveBeenCalled()
  })
})

describe("user-to-role subset guard (TASK-013 regression)", () => {
  // Peran `admin` seperti ter-seed: hampir seluruh katalog. Pelaku hanya
  // memegang manage_users + view_dashboard, jadi penugasan admin harus
  // ditolak walau namanya bukan super_admin (celah pada penjaga literal).
  const adminRole = [
    {
      name: "admin",
      permissions: [{ name: "view_dashboard" }, { name: "view_customers" }, { name: "edit_customers" }],
    },
  ]

  it("(a) rejects a manage_users delegate assigning the admin role via updateUserRoles", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "2",
      roles: ["staff"],
      permissions: ["manage_users", "view_dashboard"],
    })
    roleFindManyMock.mockResolvedValue(adminRole)
    const res = await updateUserRoles(3, [2])
    expect(res).toMatchObject({ error: expect.stringContaining("tidak Anda miliki") })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("(b) allows assigning a role whose permissions are a subset of the actor's", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "2",
      roles: ["staff"],
      permissions: ["manage_users", "view_dashboard"],
    })
    roleFindManyMock.mockResolvedValue([
      { name: "viewer", permissions: [{ name: "view_dashboard" }] },
    ])
    userUpdateMock.mockResolvedValue({ id: 3 })
    const res = await updateUserRoles(3, [5])
    expect(res).toEqual({ success: true })
    expect(userUpdateMock).toHaveBeenCalled()
  })

  it("(c) lets a super_admin assign any role without a permission lookup", async () => {
    requirePermissionMock.mockResolvedValue({ id: "1", roles: ["super_admin"], permissions: [] })
    userUpdateMock.mockResolvedValue({ id: 3 })
    const res = await updateUserRoles(3, [2])
    expect(res).toEqual({ success: true })
    expect(roleFindManyMock).not.toHaveBeenCalled()
    expect(userUpdateMock).toHaveBeenCalled()
  })

  it("(d) rejects createUser when the requested role exceeds the actor's permissions", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "2",
      roles: ["staff"],
      permissions: ["manage_users", "view_dashboard"],
    })
    roleFindManyMock.mockResolvedValue(adminRole)
    const res = await createUser(
      fd({ name: "X", email: "x@y.z", password: "passvalid123", roleIds: ["2"] }),
    )
    expect(res).toMatchObject({ error: expect.stringContaining("tidak Anda miliki") })
    expect(userCreateMock).not.toHaveBeenCalled()
  })

  it("keeps the literal super_admin block even when the actor holds its permissions", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "2",
      roles: ["staff"],
      permissions: ["manage_users", "view_dashboard"],
    })
    roleFindManyMock.mockResolvedValue([
      { name: "super_admin", permissions: [{ name: "view_dashboard" }] },
    ])
    const res = await updateUserRoles(3, [1])
    expect(res).toEqual({ error: "Hanya super admin yang dapat memberikan role super admin" })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })
})

describe("toggleUserActive", () => {
  it("flips the active flag", async () => {
    userFindMock.mockResolvedValue({ id: 4, isActive: true })
    userUpdateMock.mockResolvedValue({ id: 4 })
    userFindUniqueMock.mockResolvedValue({ id: 4, roles: [] })
    const res = await toggleUserActive(4)
    expect(res).toEqual({ success: true })
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    )
  })

  it("records an audit-trail entry for the activation toggle", async () => {
    userFindMock.mockResolvedValue({ id: 4, isActive: true })
    userUpdateMock.mockResolvedValue({ id: 4 })
    userFindUniqueMock.mockResolvedValue({ id: 4, roles: [] })
    await toggleUserActive(4)
    expect(logActivityMock).toHaveBeenCalledWith(
      "update",
      "User",
      4,
      expect.stringContaining("Menonaktifkan"),
    )
  })

  it("blocks a non-super-admin from disabling an existing super_admin", async () => {
    // Actor is a plain admin (beforeEach default). Target #4 IS a super_admin.
    userFindUniqueMock.mockResolvedValue({ id: 4, roles: [{ name: "super_admin" }] })
    const res = await toggleUserActive(4)
    expect(res).toMatchObject({ error: expect.stringContaining("super admin") })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("allows a super_admin actor to disable another super_admin", async () => {
    requirePermissionMock.mockResolvedValue({ id: "1", roles: ["super_admin"], permissions: [] })
    userFindMock.mockResolvedValue({ id: 4, isActive: true })
    userUpdateMock.mockResolvedValue({ id: 4 })
    const res = await toggleUserActive(4)
    expect(res).toEqual({ success: true })
    expect(userUpdateMock).toHaveBeenCalled()
  })

  it("returns generic error on database exception", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    userFindMock.mockRejectedValue(new Error("DB Down"))
    const res = await toggleUserActive(4)
    expect(res).toEqual({ error: "Terjadi kesalahan saat mengubah status pengguna" })
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

describe("updateProfile", () => {
  beforeEach(() => {
    requireAuthMock.mockResolvedValue({ id: "9" })
    // Default: current email equals the submitted one (no email change).
    userFindMock.mockResolvedValue({ id: 9, email: "y@z.c", password: "hashed-value" })
  })

  it("requires name and email", async () => {
    const res = await updateProfile(fd({ name: "" }))
    // New Zod-based validation reports the first failing field. Empty name
    // is the error; email is also missing but the schema is processed in
    // field order and the empty-name error is the one surfaced.
    expect(res).toEqual({ error: "Nama wajib diisi" })
  })

  it("updates the session user (IDOR guard) and maps duplicate email", async () => {
    userFindMock.mockResolvedValue({ id: 9, email: "old@z.c", password: "hashed-value" })
    bcryptCompareMock.mockResolvedValue(true)
    userUpdateMock.mockRejectedValue(new Error("Unique constraint failed"))
    const res = await updateProfile(fd({ name: "Y", email: "y@z.c", userId: "111", currentPassword: "secret123" }))
    expect(res).toEqual({ error: "Email sudah digunakan" })
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9 } }),
    )
  })

  it("rejects an email change without password confirmation", async () => {
    userFindMock.mockResolvedValue({ id: 9, email: "old@z.c", password: "hashed-value" })
    const res = await updateProfile(fd({ name: "Y", email: "y@z.c" }))
    expect(res).toEqual({ error: "Password wajib diisi untuk mengganti email" })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("rejects an email change with the wrong password", async () => {
    userFindMock.mockResolvedValue({ id: 9, email: "old@z.c", password: "hashed-value" })
    bcryptCompareMock.mockResolvedValue(false)
    const res = await updateProfile(fd({ name: "Y", email: "y@z.c", currentPassword: "wrongval" }))
    expect(res).toEqual({ error: "Password salah" })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("returns generic error on non-unique constraint exception", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    userUpdateMock.mockRejectedValue(new Error("Database offline"))
    const res = await updateProfile(fd({ name: "Y", email: "y@z.c" }))
    expect(res).toEqual({ error: "Terjadi kesalahan saat memperbarui profil" })
    consoleSpy.mockRestore()
  })

  it("accepts an email change with the correct password", async () => {
    userFindMock.mockResolvedValue({ id: 9, email: "old@z.c", password: "hashed-value" })
    bcryptCompareMock.mockResolvedValue(true)
    userUpdateMock.mockResolvedValue({ id: 9 })
    const res = await updateProfile(fd({ name: "Y", email: "y@z.c", currentPassword: "secret123" }))
    expect(res).toEqual({ success: true })
    expect(bcryptCompareMock).toHaveBeenCalledWith("secret123", "hashed-value")
  })

  it("returns success on valid update", async () => {
    userUpdateMock.mockResolvedValue({ id: 9 })
    const res = await updateProfile(fd({ name: "Y", email: "y@z.c" }))
    expect(res).toEqual({ success: true })
    expect(revalidateMock).toHaveBeenCalledWith("/profil")
    expect(revalidateMock).toHaveBeenCalledWith("/")
  })
})

/**
 * Penugasan gudang per pengguna — satu-satunya jalur tulis `user_warehouses`.
 *
 * Tanpa aksi ini tabel itu tidak punya penulis sama sekali, sementara
 * `getWarehouseScope` menentukan cakupan gudang peran `warehouse` dari sana dan
 * MENOLAK bila kosong: peran `warehouse` tidak bisa diberi akses gudang mana pun.
 */
describe("updateUserWarehouses", () => {
  it("mengganti himpunan penugasan dalam SATU penulisan bertingkat", async () => {
    warehouseCountMock.mockResolvedValue(2)
    userUpdateMock.mockResolvedValue({ id: 3 })

    const res = await updateUserWarehouses(3, [5, 2])

    expect(res).toEqual({ success: true })
    expect(requirePermissionMock).toHaveBeenCalledWith("manage_users")
    const arg = userUpdateMock.mock.calls[0][0]
    // Ganti-himpunan: hapus semua lalu buat yang baru dalam satu tulisan, supaya
    // tidak ada saat pengguna kehilangan seluruh akses karena dua tulisan terpisah.
    expect(arg.data.userWarehouses.deleteMany).toEqual({})
    expect(arg.data.userWarehouses.create).toEqual([{ warehouseId: 5 }, { warehouseId: 2 }])
  })

  it("membuang id ganda sebelum menulis", async () => {
    warehouseCountMock.mockResolvedValue(2)
    userUpdateMock.mockResolvedValue({ id: 3 })
    await updateUserWarehouses(3, [5, 5, 2])
    expect(warehouseCountMock).toHaveBeenCalledWith({ where: { id: { in: [5, 2] } } })
    const arg = userUpdateMock.mock.calls[0][0]
    expect(arg.data.userWarehouses.create).toEqual([{ warehouseId: 5 }, { warehouseId: 2 }])
  })

  it("menolak id yang tidak valid tanpa menyentuh basis data", async () => {
    for (const bad of [[NaN], [-1], [0], ["abc"]]) {
      const res = await updateUserWarehouses(3, bad as number[])
      expect(res.error).toBeTruthy()
      expect(userUpdateMock).not.toHaveBeenCalled()
      expect(warehouseCountMock).not.toHaveBeenCalled()
    }
  })

  it("menolak bila ada gudang yang tidak ditemukan (penugasan hampa)", async () => {
    // Dua id diminta, hanya satu yang ada: menulisnya akan membuat baris penugasan
    // yang tampil di halaman pengguna tetapi tidak memberi akses apa pun.
    warehouseCountMock.mockResolvedValue(1)
    const res = await updateUserWarehouses(3, [5, 999])
    expect(res).toEqual({ error: "Ada gudang yang tidak ditemukan" })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("mengizinkan pengosongan penugasan (mencabut seluruh akses gudang)", async () => {
    userUpdateMock.mockResolvedValue({ id: 3 })
    const res = await updateUserWarehouses(3, [])
    expect(res).toEqual({ success: true })
    const arg = userUpdateMock.mock.calls[0][0]
    expect(arg.data.userWarehouses.create).toEqual([])
    // Tidak ada id untuk diperiksa, jadi tidak perlu menanyakan gudang ke db.
    expect(warehouseCountMock).not.toHaveBeenCalled()
  })

  it("mencatat jejak audit berisi daftar gudang sebelum/sesudah", async () => {
    warehouseCountMock.mockResolvedValue(2)
    userUpdateMock.mockResolvedValue({ id: 3 })
    await updateUserWarehouses(3, [5, 2])
    expect(logActivityMock).toHaveBeenCalledWith(
      "update",
      "User",
      3,
      expect.stringContaining("5, 2"),
    )
    expect(revalidateMock).toHaveBeenCalledWith("/pengaturan/pengguna")
  })

  it("tidak menulis apa pun bila izin ditolak", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    requirePermissionMock.mockRejectedValue(new Error("Tidak punya izin"))
    const res = await updateUserWarehouses(3, [5])
    expect(res.error).toBeTruthy()
    expect(userUpdateMock).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
