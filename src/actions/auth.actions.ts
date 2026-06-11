"use server"

import { signIn, signOut } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { requireAuth, requirePermission } from "@/lib/auth/permissions"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"

// Privilege-escalation guard: a non-super-admin (even one holding manage_users)
// must not be able to grant the super_admin role to anyone — including
// themselves. Returns an error message when the assignment is disallowed,
// otherwise null. Not exported, so it stays a plain helper under "use server".
async function assertNoSuperAdminGrant(
  actorRoles: string[],
  roleIds: number[]
): Promise<string | null> {
  if (actorRoles.includes("super_admin")) return null
  if (roleIds.length === 0) return null
  const requested = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { name: true },
  })
  if (requested.some((r) => r.name === "super_admin")) {
    return "Hanya super admin yang dapat memberikan role super admin"
  }
  return null
}

// Target-escalation guard: a non-super-admin must not be able to modify or
// disable an existing super_admin's account.
async function assertCanModifyTarget(
  actorRoles: string[],
  targetUserId: number
): Promise<string | null> {
  if (actorRoles.includes("super_admin")) return null
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { roles: { select: { name: true } } },
  })
  if (!target) return "Pengguna tidak ditemukan"
  if (target.roles.some((r) => r.name === "super_admin")) {
    return "Hanya super admin yang dapat mengubah atau menonaktifkan akun super admin"
  }
  return null
}

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Email dan password wajib diisi" }
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
    return { success: true }
  } catch {
    return { error: "Email atau password salah" }
  }
}

export async function logoutAction() {
  try {
    await signOut({ redirect: false })
    revalidatePath("/")
  } catch {
    // signOut may throw on expired session — safe to ignore
  }
}

export async function changePassword(formData: FormData) {
  try {
    // Fix #17: Validate userId from session, not formData (IDOR prevention)
    const sessionUser = await requireAuth()
    const userId = Number(sessionUser.id)

    const currentPassword = formData.get("currentPassword") as string
    const newPassword = formData.get("newPassword") as string

    if (!currentPassword || !newPassword) {
      return { error: "Password lama dan baru wajib diisi" }
    }

    if (newPassword.length < 8) {
      return { error: "Password baru minimal 8 karakter" }
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    })

    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) {
      return { error: "Password lama salah" }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12)

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })

    revalidatePath("/profil")
    return { success: true }
  } catch (e) {
    console.error("[changePassword]", e)
    return { error: "Terjadi kesalahan saat mengubah password" }
  }
}

export async function createUser(formData: FormData) {
  try {
    // Fix #19: Add permission check
    const actor = await requirePermission("manage_users")

    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string
    const roleIds = formData.getAll("roleIds").map(Number)

    if (!name || !email || !password) {
      return { error: "Nama, email, dan password wajib diisi" }
    }

    // Privilege-escalation guard: block granting super_admin unless the actor
    // is super_admin (prevents a manage_users holder from minting super admins).
    const grantErr = await assertNoSuperAdminGrant(actor.roles, roleIds)
    if (grantErr) {
      return { error: grantErr }
    }

    // Enforce the same minimum-length policy as changePassword (min 8), so a
    // user can't be created with a password weaker than they're allowed to
    // change it to later.
    if (password.length < 8) {
      return { error: "Password minimal 8 karakter" }
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    // Use try/catch on create to handle race condition (duplicate email)
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        isActive: true,
        roles: {
          connect: roleIds.map((id) => ({ id })),
        },
      },
    })

    revalidatePath("/pengaturan/pengguna")
    return { success: true, id: user.id }
  } catch (e) {
    // Handle unique constraint violation (race condition on email)
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return { error: "Email sudah terdaftar" }
    }
    console.error("[createUser]", e)
    return { error: "Terjadi kesalahan saat membuat pengguna" }
  }
}

export async function updateUserRoles(userId: number, roleIds: number[]) {
  try {
    // Fix #20: Add permission check — prevents privilege escalation
    const actor = await requirePermission("manage_users")

    // Target-escalation guard: a non-super-admin must not be able to alter the
    // roles of an existing super_admin (e.g. demote/strip the super_admin role).
    const targetErr = await assertCanModifyTarget(actor.roles, userId)
    if (targetErr) {
      return { error: targetErr }
    }

    // Privilege-escalation guard: a non-super-admin must not be able to assign
    // the super_admin role to anyone (including themselves).
    const grantErr = await assertNoSuperAdminGrant(actor.roles, roleIds)
    if (grantErr) {
      return { error: grantErr }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        roles: {
          set: roleIds.map((id) => ({ id })),
        },
      },
    })

    revalidatePath("/pengaturan/pengguna")
    return { success: true }
  } catch (e) {
    console.error("[updateUserRoles]", e)
    return { error: "Terjadi kesalahan saat memperbarui role" }
  }
}

export async function toggleUserActive(userId: number) {
  try {
    // Fix #21: Add permission check
    const actor = await requirePermission("manage_users")

    // Target-escalation guard: a non-super-admin must not be able to disable
    // an existing super_admin's account.
    const targetErr = await assertCanModifyTarget(actor.roles, userId)
    if (targetErr) {
      return { error: targetErr }
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    })

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
    })

    revalidatePath("/pengaturan/pengguna")
    return { success: true }
  } catch (e) {
    console.error("[toggleUserActive]", e)
    return { error: "Terjadi kesalahan saat mengubah status pengguna" }
  }
}

export async function updateProfile(formData: FormData) {
  try {
    // Fix #18: Validate userId from session (IDOR prevention)
    const sessionUser = await requireAuth()
    const userId = Number(sessionUser.id)

    const name = formData.get("name") as string
    const email = formData.get("email") as string

    if (!name || !email) {
      return { error: "Nama dan email wajib diisi" }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { name, email },
    })

    revalidatePath("/profil")
    revalidatePath("/")
    return { success: true }
  } catch (e) {
    // Handle unique constraint violation (duplicate email)
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return { error: "Email sudah digunakan" }
    }
    console.error("[updateProfile]", e)
    return { error: "Terjadi kesalahan saat memperbarui profil" }
  }
}
