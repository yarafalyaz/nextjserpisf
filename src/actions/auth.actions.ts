"use server"

import { signIn, signOut } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { requireAuth, requirePermission } from "@/lib/auth/permissions"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"

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
    await requirePermission("manage_users")

    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string
    const roleIds = formData.getAll("roleIds").map(Number)

    if (!name || !email || !password) {
      return { error: "Nama, email, dan password wajib diisi" }
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
    await requirePermission("manage_users")

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
    await requirePermission("manage_users")

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
