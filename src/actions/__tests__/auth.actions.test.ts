import { describe, it, expect, vi, beforeEach } from "vitest"

const signInMock = vi.fn()
const signOutMock = vi.fn()
const requireAuthMock = vi.fn()
const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()

const userFindMock = vi.fn()
const userCreateMock = vi.fn()
const userUpdateMock = vi.fn()
const roleFindManyMock = vi.fn()

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
      create: (...a: unknown[]) => userCreateMock(...a),
      update: (...a: unknown[]) => userUpdateMock(...a),
    },
    role: {
      findMany: (...a: unknown[]) => roleFindManyMock(...a),
    },
  },
}))
vi.mock("bcryptjs", () => ({
  default: {
    compare: (...a: unknown[]) => bcryptCompareMock(...a),
    hash: (...a: unknown[]) => bcryptHashMock(...a),
  },
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidateMock(...a),
}))

import {
  loginAction,
  logoutAction,
  changePassword,
  createUser,
  updateUserRoles,
  toggleUserActive,
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
    revalidateMock, userFindMock, userCreateMock, userUpdateMock,
    roleFindManyMock, bcryptCompareMock, bcryptHashMock,
  ]) m.mockReset()
  bcryptHashMock.mockResolvedValue("hashed-value")
  // requirePermission resolves to the acting user (default: a plain admin
  // holding manage_users but NOT super_admin). The privesc guard reads .roles.
  requirePermissionMock.mockResolvedValue({ id: "1", roles: ["admin"], permissions: ["manage_users"] })
  // No requested role is super_admin by default.
  roleFindManyMock.mockResolvedValue([])
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
    expect(res).toEqual({ error: "Password lama dan baru wajib diisi" })
  })

  it("enforces minimum length on the new value", async () => {
    const res = await changePassword(fd({ [SECRET_KEY]: "oldvalue1", [NEW_KEY]: "short" }))
    expect(res).toEqual({ error: "Password baru minimal 8 karakter" })
  })

  it("rejects when the old value does not match", async () => {
    userFindMock.mockResolvedValue({ id: 7, password: "stored-hash" })
    bcryptCompareMock.mockResolvedValue(false)
    const res = await changePassword(fd({ [SECRET_KEY]: "oldvalue1", [NEW_KEY]: "brandnewval" }))
    expect(res).toEqual({ error: "Password lama salah" })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it("uses the session user id, never formData (IDOR guard)", async () => {
    userFindMock.mockResolvedValue({ id: 7, password: "stored-hash" })
    bcryptCompareMock.mockResolvedValue(true)
    userUpdateMock.mockResolvedValue({ id: 7 })
    const res = await changePassword(
      fd({ [SECRET_KEY]: "oldvalue1", [NEW_KEY]: "brandnewval", userId: "999" }),
    )
    expect(res).toEqual({ success: true })
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    )
  })
})

describe("createUser", () => {
  it("enforces the manage_users permission before creating", async () => {
    userCreateMock.mockResolvedValue({ id: 1 })
    await createUser(fd({ name: "X", email: "x@y.z", password: "passval12" }))
    expect(requirePermissionMock).toHaveBeenCalledWith("manage_users")
  })

  it("requires name, email, and password", async () => {
    const res = await createUser(fd({ name: "X" }))
    expect(res).toEqual({ error: "Nama, email, dan password wajib diisi" })
  })

  it("hashes the password and connects roles", async () => {
    userCreateMock.mockResolvedValue({ id: 12 })
    const res = await createUser(
      fd({ name: "X", email: "x@y.z", password: "passval12", roleIds: ["1", "2"] }),
    )
    expect(res).toEqual({ success: true, id: 12 })
    expect(bcryptHashMock).toHaveBeenCalledWith("passval12", 12)
    const arg = userCreateMock.mock.calls[0][0]
    expect(arg.data.password).toBe("hashed-value")
    expect(arg.data.roles.connect).toEqual([{ id: 1 }, { id: 2 }])
  })

  it("maps a duplicate-email constraint to a friendly error", async () => {
    userCreateMock.mockRejectedValue(new Error("Unique constraint failed on email"))
    const res = await createUser(fd({ name: "X", email: "x@y.z", password: "passval12" }))
    expect(res).toEqual({ error: "Email sudah terdaftar" })
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
})

describe("toggleUserActive", () => {
  it("flips the active flag", async () => {
    requirePermissionMock.mockResolvedValue(undefined)
    userFindMock.mockResolvedValue({ id: 4, isActive: true })
    userUpdateMock.mockResolvedValue({ id: 4 })
    const res = await toggleUserActive(4)
    expect(res).toEqual({ success: true })
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    )
  })
})

describe("updateProfile", () => {
  beforeEach(() => requireAuthMock.mockResolvedValue({ id: "9" }))

  it("requires name and email", async () => {
    const res = await updateProfile(fd({ name: "" }))
    expect(res).toEqual({ error: "Nama dan email wajib diisi" })
  })

  it("updates the session user (IDOR guard) and maps duplicate email", async () => {
    userUpdateMock.mockRejectedValue(new Error("Unique constraint failed"))
    const res = await updateProfile(fd({ name: "Y", email: "y@z.c", userId: "111" }))
    expect(res).toEqual({ error: "Email sudah digunakan" })
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9 } }),
    )
  })
})
