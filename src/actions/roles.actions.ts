"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function createRole(formData: FormData) {
  await requirePermission("manage_settings")

  const name = formData.get("name") as string
  if (!name || !name.trim()) throw new Error("Nama role wajib diisi")

  const permissionIds = formData.getAll("permissions").map((id) => Number(id)).filter(Boolean)

  await prisma.role.create({
    data: {
      name: name.trim(),
      guardName: "web",
      permissions: {
        connect: permissionIds.map((id) => ({ id })),
      },
    },
  })

  revalidatePath("/pengaturan/peran")
  redirect("/pengaturan/peran")
}

export async function updateRole(id: number, formData: FormData) {
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
  redirect("/pengaturan/peran")
}

export async function deleteRole(id: number) {
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
  redirect("/pengaturan/peran")
}
