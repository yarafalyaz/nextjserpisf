"use server"

import { signIn, signOut } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { requireAuth, requirePermission } from "@/lib/auth/permissions"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import {
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  updateProfileSchema,
  updateUserRolesSchema,
} from "@/lib/validations/auth.schemas"

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
  // Validate via Zod directly on the raw values (NOT parseFormData): the
  // generic FormData→object coercion turns "true"/"false"/"on"/"off" into
  // booleans, which would corrupt a password literally equal to one of those
  // tokens. Email + password are read as raw strings and length/format-capped.
  // Coerce missing-field `null` → "" so the .min(1) guard fires with the
  // user-facing "wajib diisi" string.
  const parsed = loginSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  })
  if (!parsed.success) {
    return { error: "Email dan password wajib diisi" }
  }
  const { email, password } = parsed.data

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

    // Validate via Zod directly on the raw values (NOT parseFormData — see
    // loginAction for the boolean-coercion reason).
    const parsed = changePasswordSchema.safeParse({
      currentPassword: formData.get("currentPassword") ?? "",
      newPassword: formData.get("newPassword") ?? "",
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validasi gagal" }
    }
    const { currentPassword, newPassword } = parsed.data

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

    // Validate name/email/password via Zod. The boolean-coercion concern in
    // changePassword/loginAction does not apply here (no `password` field is
    // ever literally "true"/"false" in this form, and parseFormData only
    // coerces exact matches, not substrings), but the roleIds come from
    // formData.getAll — that path is NOT covered by parseFormData's forEach
    // (which only retains the last value per key). Re-validate them through
    // the .roleIds slot of the schema below, so a caller can't sneak in
    // roleIds=["abc", "-1", "0"] to either crash the .connect or no-op.
    //
    // formData.get() returns `null` for missing fields, which Zod's string()
    // rejects with a generic "Invalid input: expected string, received null"
    // (not the friendly "wajib diisi" message). Coerce to "" so the .min(1)
    // guard fires with the user-facing string.
    const rawRoleIds = formData.getAll("roleIds").map((v) => String(v))
    const parsed = createUserSchema.safeParse({
      name: formData.get("name") ?? "",
      email: formData.get("email") ?? "",
      password: formData.get("password") ?? "",
      roleIds: rawRoleIds,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validasi gagal" }
    }
    const { name, email, password, roleIds } = parsed.data

    // Privilege-escalation guard: block granting super_admin unless the actor
    // is super_admin (prevents a manage_users holder from minting super admins).
    const grantErr = await assertNoSuperAdminGrant(actor.roles, roleIds ?? [])
    if (grantErr) {
      return { error: grantErr }
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
          connect: (roleIds ?? []).map((id) => ({ id })),
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

    // Validate the roleIds array (it comes over the wire as a plain number[]).
    // Without this guard, a caller could pass [NaN], [-1], [0] (the .set would
    // throw on NaN, silently no-op on 0/negative). updateUserRolesSchema also
    // de-dupes so a duplicated id doesn't trigger a redundant Prisma write.
    const parsed = updateUserRolesSchema.safeParse(roleIds)
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validasi gagal" }
    }
    const cleanRoleIds = parsed.data

    // Target-escalation guard: a non-super-admin must not be able to alter the
    // roles of an existing super_admin (e.g. demote/strip the super_admin role).
    const targetErr = await assertCanModifyTarget(actor.roles, userId)
    if (targetErr) {
      return { error: targetErr }
    }

    // Privilege-escalation guard: a non-super-admin must not be able to assign
    // the super_admin role to anyone (including themselves).
    const grantErr = await assertNoSuperAdminGrant(actor.roles, cleanRoleIds)
    if (grantErr) {
      return { error: grantErr }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        roles: {
          set: cleanRoleIds.map((id) => ({ id })),
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

    // Validate name/email via Zod. The legacy hand-rolled `!name || !email`
    // check let an untrimmed whitespace string through and accepted any
    // non-email string (locking the user out of their own account on next
    // login). updateProfileSchema trims + length-caps + forces email format.
    const parsed = updateProfileSchema.safeParse({
      name: formData.get("name") ?? "",
      email: formData.get("email") ?? "",
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validasi gagal" }
    }
    const { name, email } = parsed.data

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
