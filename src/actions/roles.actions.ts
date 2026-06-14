"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { createRoleSchema, updateRoleSchema } from "@/lib/validations/roles.schemas"

// Least-privilege guard: a non-super-admin must not attach a permission they
// don't already hold. Without this, a manage_settings holder could mint/modify
// a role carrying manage_users / approve_workflows / etc. and escalate beyond
// their own permission set (a privesc that bypasses the super_admin-name check,
// since the role need not be named super_admin). super_admin bypasses.
// Returns an error message when disallowed, otherwise null.
async function assertCanGrantPermissions(
  actor: { roles: string[]; permissions: string[] },
  permissionIds: number[]
): Promise<string | null> {
  if (actor.roles.includes("super_admin")) return null
  if (permissionIds.length === 0) return null
  const requested = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
    select: { name: true },
  })
  const held = new Set(actor.permissions)
  const missing = requested.filter((p) => !held.has(p.name)).map((p) => p.name)
  if (missing.length > 0) {
    return `Anda tidak dapat memberikan izin yang tidak Anda miliki: ${missing.join(", ")}`
  }
  return null
}

export async function createRole(formData: FormData) {
  try {
  const actor = await requirePermission("manage_settings")

  const parsed = parseFormData(createRoleSchema, formData)
  if (!parsed.success) {
    throw new Error(parsed.error)
  }

  const { name } = parsed.data
  const permissionIds = formData.getAll("permissions").map((id) => Number(id)).filter(Boolean)

  const grantErr = await assertCanGrantPermissions(actor, permissionIds)
  if (grantErr) {
    throw new Error(grantErr)
  }

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
    if (isNextRedirectError(e)) throw e
    console.error("[createRole]", getErrorMessage(e) || e)
    throw e
  }
}

export async function updateRole(id: number, formData: FormData) {
  try {
  const actor = await requirePermission("manage_settings")

  const parsed = parseFormData(updateRoleSchema, formData)
  if (!parsed.success) {
    throw new Error(parsed.error)
  }

  const { name } = parsed.data
  const permissionIds = formData.getAll("permissions").map((pid) => Number(pid)).filter(Boolean)

  // Protect the built-in super_admin role: only a super_admin may modify it.
  // Otherwise a manage_settings holder could strip its permissions or rename it,
  // locking the real admins out — a privilege escalation via denial-of-service
  // that bypasses assertCanGrantPermissions (which only guards the granted set,
  // not edits to the all-powerful role itself).
  const existing = await prisma.role.findUnique({ where: { id }, select: { name: true } })
  if (existing?.name === "super_admin" && !actor.roles.includes("super_admin")) {
    throw new Error("Hanya super_admin yang dapat mengubah peran super_admin")
  }

  const grantErr = await assertCanGrantPermissions(actor, permissionIds)
  if (grantErr) {
    throw new Error(grantErr)
  }

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
    if (isNextRedirectError(e)) throw e
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

  // Protect the built-in super_admin role: must never be deleted.
  if (role.name === "super_admin") {
    throw new Error("Peran super_admin adalah peran sistem dan tidak dapat dihapus")
  }

  if (role.users.length > 0) {
    throw new Error(`Role "${role.name}" masih digunakan oleh ${role.users.length} user. Hapus assignment terlebih dahulu.`)
  }

  await prisma.role.delete({ where: { id } })

  revalidatePath("/pengaturan/peran")
  await logActivity("delete", "Role", id, "Menghapus peran")
  redirect("/pengaturan/peran")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteRole]", getErrorMessage(e) || e)
    throw e
  }
}
