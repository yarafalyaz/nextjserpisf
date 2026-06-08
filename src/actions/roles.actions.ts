"use server"

import { getErrorMessage } from "@/lib/utils/error"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { logActivity } from "@/lib/services/activity-log.service"

export async function createRole(formData: FormData) {
  try {
  await requirePermission("manage_settings")

  const name = formData.get("name") as string
  if (!name || !name.trim()) throw new Error("Nama role wajib diisi")

  const permissionIds = formData.getAll("permissions").map((id) => Number(id)).filter(Boolean)

  const role = await prisma.role.create({
    data: {
      name: name.trim(),
      guardName: "web",
      permissions: {
        connect: permissionIds.map((id) => ({ id })),
      },
    },
  })

  revalidatePath("/pengaturan/peran")
  await logActivity("create", "Role", role.id, "Membuat peran")
  redirect("/pengaturan/peran")

  } catch (e: unknown) {
    console.error("[createRole]", getErrorMessage(e) || e)
    throw e
  }
}

export async function updateRole(id: number, formData: FormData) {
  try {
  await requirePermission("manage_settings")

  const name = formData.get("name") as string
  if (!name || !name.trim()) throw new Error("Nama role wajib diisi")

  const permissionIds = formData.getAll("permissions").map((pid) => Number(pid)).filter(Boolean)

  await prisma.role.update({
    where: { id },
    data: {
      name: name.trim(),
      permissions: {
        set: permissionIds.map((pid) => ({ id: pid })),
      },
    },
  })

  revalidatePath("/pengaturan/peran")
  await logActivity("update", "Role", id, "Memperbarui peran")
  redirect("/pengaturan/peran")

  } catch (e: unknown) {
    console.error("[updateRole]", getErrorMessage(e) || e)
    throw e
  }
}

export async function deleteRole(id: number) {
  try {
  await requirePermission("manage_settings")

  const role = await prisma.role.findUnique({
    where: { id },
    include: { users: true },
  })

  if (!role) throw new Error("Role tidak ditemukan")
  if (role.users.length > 0) {
    throw new Error(`Role "${role.name}" masih digunakan oleh ${role.users.length} user. Hapus assignment terlebih dahulu.`)
  }

  await prisma.role.delete({ where: { id } })

  revalidatePath("/pengaturan/peran")
  await logActivity("delete", "Role", id, "Menghapus peran")
  redirect("/pengaturan/peran")

  } catch (e: unknown) {
    console.error("[deleteRole]", getErrorMessage(e) || e)
    throw e
  }
}
