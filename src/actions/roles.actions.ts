"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { isReservedRoleName } from "@/lib/auth/role-names"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { createRoleSchema, updateRoleSchema, rolePermissionIdsSchema } from "@/lib/validations/roles.schemas"
import { nextSlug } from "@/lib/utils/slug-db"
import { assertCanGrantPermissions } from "@/lib/auth/role-grant"

// Kontrak galat modul ini sengaja dibagi dua:
//  - `createRole`/`updateRole` dipakai form halaman, jadi kegagalan yang bisa
//    diperbaiki pengguna (validasi, nama dicadangkan, izin di luar miliknya)
//    DIKEMBALIKAN sebagai { success: false, error } agar pesannya tampil inline
//    dan isian form tidak hilang.
//  - `deleteRole` dipanggil dari komponen klien (DeleteButton) yang sudah
//    menampilkan toast untuk error yang dilempar.
// Galat tak terduga di keduanya tetap dilempar ke error boundary.

// Checkbox field berulang: getAll pertahankan nilai penuh; string kosong
// (field absen/tak dicentang) berarti tanpa izin, bukan ID tidak valid.
function permissionValues(formData: FormData): string[] {
  return formData.getAll("permissions").map((v) => String(v)).filter((v) => v.trim() !== "")
}

/** Kegagalan yang bisa diperbaiki pengguna, dikembalikan ke form (lihat catatan di atas). */
export type RoleFormError = { success: false; error: string }

export async function createRole(formData: FormData): Promise<RoleFormError> {
  try {
  // Sama dengan aturan di proxy.ts + halaman /pengaturan/peran: izin `manage_roles`
  // (super_admin bypass). Dulu action-nya `manage_settings`, sehingga pemegang izin itu
  // bisa memanggilnya langsung padahal halaman peran tertutup untuknya.
  const actor = await requirePermission("manage_roles")

  const parsed = parseFormData(createRoleSchema, formData)
  if (!parsed.success) {
    return { success: false, error: parsed.error }
  }

  const { name } = parsed.data
  // Nama role istimewa hanya boleh datang dari seeder/installer.
  if (isReservedRoleName(name)) {
    return { success: false, error: `Nama peran "${name}" dicadangkan sistem dan tidak dapat dibuat.` }
  }
  const idsParsed = rolePermissionIdsSchema.safeParse(permissionValues(formData))
  if (!idsParsed.success) {
    return { success: false, error: "Validasi gagal: permissions: Izin tidak valid" }
  }
  const permissionIds = [...new Set(idsParsed.data)]

  const grantErr = await assertCanGrantPermissions(actor, permissionIds)
  if (grantErr) {
    return { success: false, error: grantErr }
  }

  const role = await prisma.role.create({
    data: {
      name: name.trim(),
      slug: await nextSlug("role", name.trim()),
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

export async function updateRole(id: number, formData: FormData): Promise<RoleFormError> {
  try {
  const actor = await requirePermission("manage_roles")

  const parsed = parseFormData(updateRoleSchema, formData)
  if (!parsed.success) {
    return { success: false, error: parsed.error }
  }

  const { name } = parsed.data
  const idsParsed = rolePermissionIdsSchema.safeParse(permissionValues(formData))
  if (!idsParsed.success) {
    return { success: false, error: "Validasi gagal: permissions: Izin tidak valid" }
  }
  const permissionIds = [...new Set(idsParsed.data)]

  // Protect the built-in super_admin role: only a super_admin may modify it.
  // Otherwise a manage_settings holder could strip its permissions or rename it,
  // locking the real admins out — a privilege escalation via denial-of-service
  // that bypasses assertCanGrantPermissions (which only guards the granted set,
  // not edits to the all-powerful role itself).
  const existing = await prisma.role.findUnique({ where: { id }, select: { name: true } })
  if (existing?.name === "super_admin" && !actor.roles.includes("super_admin")) {
    return { success: false, error: "Hanya super_admin yang dapat mengubah peran super_admin" }
  }

  // Nama istimewa hanya boleh datang dari seeder/installer — tapi MENJAGA nama yang
  // sudah dipakai (mis. mengubah daftar izin role `super_admin`) tetap harus bisa,
  // kalau tidak seluruh hak akses role bawaan jadi tidak bisa diatur.
  if (name.trim().toLowerCase() !== (existing?.name ?? "").trim().toLowerCase() && isReservedRoleName(name)) {
    return { success: false, error: `Nama peran "${name}" dicadangkan sistem dan tidak dapat dipakai.` }
  }

  const grantErr = await assertCanGrantPermissions(actor, permissionIds)
  if (grantErr) {
    return { success: false, error: grantErr }
  }

  // Slug hanya dihitung ulang saat NAMA berubah: menyimpan daftar izin saja (mis. dari
  // matriks) tidak boleh mengubah URL peran — kalau tidak, tautan/bookmark lama mati
  // dan slug yang sudah tertulis di dokumen ikut berubah tanpa alasan.
  const nameChanged = name.trim() !== (existing?.name ?? name.trim())

  await prisma.role.update({
    where: { id },
    data: {
      name: name.trim(),
      ...(nameChanged ? { slug: await nextSlug("role", name.trim(), { excludeId: id }) } : {}),
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
  await requirePermission("manage_roles")

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

  // ApprovalWorkflowStep.roleId bare Int, no FK/relation to Role — raw delete
  // leaves dangling approver. assertStepApprover then finds no role, throws
  // "bukan approver" for everyone: pending approvals at that step deadlock
  // permanently (only super_admin bypass). Refuse while steps reference it.
  const usedBySteps = await prisma.approvalWorkflowStep.count({ where: { roleId: id } })
  if (usedBySteps > 0) {
    throw new Error(`Role "${role.name}" masih digunakan oleh ${usedBySteps} langkah persetujuan. Ubah approver langkah tersebut terlebih dahulu.`)
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
