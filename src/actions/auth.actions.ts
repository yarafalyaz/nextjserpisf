"use server"

import { signIn, signOut } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
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
  await signOut({ redirect: false })
  revalidatePath("/")
}

export async function changePassword(formData: FormData) {
  const userId = Number(formData.get("userId"))
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

  return { success: true }
}

export async function createUser(formData: FormData) {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const roleIds = formData.getAll("roleIds").map(Number)

  if (!name || !email || !password) {
    return { error: "Nama, email, dan password wajib diisi" }
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return { error: "Email sudah terdaftar" }
  }

  const hashedPassword = await bcrypt.hash(password, 12)

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

  revalidatePath("/settings/users")
  return { success: true, id: user.id }
}

export async function updateUserRoles(userId: number, roleIds: number[]) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      roles: {
        set: roleIds.map((id) => ({ id })),
      },
    },
  })

  revalidatePath("/settings/users")
  return { success: true }
}

export async function toggleUserActive(userId: number) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
  })

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  })

  revalidatePath("/settings/users")
  return { success: true }
}

export async function updateProfile(formData: FormData) {
  const userId = Number(formData.get("userId"))
  const name = formData.get("name") as string
  const email = formData.get("email") as string

  if (!name || !email) {
    return { error: "Nama dan email wajib diisi" }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { name, email },
  })

  revalidatePath("/profile")
  revalidatePath("/")
  return { success: true }
}
