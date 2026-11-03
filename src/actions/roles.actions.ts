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
import { nextSlugWithClient } from "@/lib/utils/slug-db"
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
  let grantErrInTx: string | null = null
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

  // Putaran 77: gap-lock tabel + slug delegate tx dalam satu transaksi.
  // Role.name dan Role.slug sama-sama @unique; slug global tidak melihat
  // baris tak-tercommit transaksi lain sehingga create nama sama bersamaan
  // memilih slug sama lalu satu kalah P2002 mentah.
  const role = await prisma.$transaction(async (tx) => {
    if (typeof tx.$executeRaw === "function") {
      await tx.$executeRaw`SELECT id FROM roles FOR UPDATE`
    }
    // Putaran 84: nilai ulang grant dari bacaan tx (izin bisa berubah
    // sejak cek pra-tx).
    const grantErrTx = await assertCanGrantPermissions(actor, permissionIds, tx as never)
    if (grantErrTx) {
      grantErrInTx = grantErrTx
      throw new Error("GRANT_CHECK_FAILED")
    }
    return tx.role.create({
      data: {
        name: name.trim(),
        slug: await nextSlugWithClient(tx as never, "role", name.trim()),
        guardName: "web",
        permissions: {
          connect: permissionIds.map((id) => ({ id })),
        },
      },
    })
  })

  revalidatePath("/pengaturan/peran")
  await logActivity("create", "Role", role.id, "Membuat peran")
  redirect("/pengaturan/peran")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    if (grantErrInTx) return { success: false, error: grantErrInTx }
    console.error("[createRole]", getErrorMessage(e) || e)
    // Nama/slug peran unik di DB: duplikat adalah galat yang bisa diperbaiki
    // pengguna, jadi kembalikan sebagai error form (kontrak ActionForm),
    // bukan throw ke error boundary yang membuang isian.
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { success: false, error: "Nama peran sudah dipakai. Pakai nama lain." }
    }
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

  const grantErr = await assertCanGrantPermissions(actor, permissionIds)
  if (grantErr) {
    return { success: false, error: grantErr }
  }

  // Putaran 77: guard + tulis dalam SATU tx berkunci baris role (pola
  // deleteRole, yang mengunci baris yang sama). Jalur lama menilai guard dari
  // snapshot `prisma.role.findUnique` pra-tx lalu menulis polos — rename/guard
  // reserved bisa lolos dari nama basi, dan role yang terhapus konkuren muncul
  // sebagai P2025 mentah. Di sini semua guard dinilai ulang dari bacaan
  // terkunci, dan slug dihitung lewat delegate tx.
  const guardError = await prisma.$transaction(async (tx) => {
    if (typeof tx.$executeRaw === "function") {
      await tx.$executeRaw`SELECT id FROM roles WHERE id = ${id} FOR UPDATE`
    }
    const existing = await tx.role.findUnique({ where: { id }, select: { name: true } })
    if (!existing) throw new Error("Role tidak ditemukan")

    // Putaran 84: nilai ulang grant dari bacaan terkunci (konten izin bisa
    // berubah sejak cek pra-tx).
    const grantErrTx = await assertCanGrantPermissions(actor, permissionIds, tx as never)
    if (grantErrTx) return grantErrTx

    // Protect the built-in super_admin role: only a super_admin may modify it.
    // Otherwise a manage_settings holder could strip its permissions or rename it,
    // locking the real admins out — a privilege escalation via denial-of-service
    // that bypasses assertCanGrantPermissions (which only guards the granted set,
    // not edits to the all-powerful role itself).
    if (existing.name === "super_admin" && !actor.roles.includes("super_admin")) {
      return "Hanya super_admin yang dapat mengubah peran super_admin"
    }

    // Nama istimewa hanya boleh datang dari seeder/installer — tapi MENJAGA nama yang
    // sudah dipakai (mis. mengubah daftar izin role `super_admin`) tetap harus bisa,
    // kalau tidak seluruh hak akses role bawaan jadi tidak bisa diatur.
    if (name.trim().toLowerCase() !== existing.name.trim().toLowerCase() && isReservedRoleName(name)) {
      return `Nama peran "${name}" dicadangkan sistem dan tidak dapat dipakai.`
    }

    // Role dicadangkan (RESERVED_ROLE_NAMES) memberi akses lintas-cakupan berbasis
    // NAMA di warehouse-scope/hr-scope. Mengganti namanya ke nama biasa atau
    // mengosongkan izinnya mematikan akses itu untuk semua pemegangnya — DoS
    // administratif yang lolos dari assertCanGrantPermissions (set kosong selalu
    // lolos). Hanya super_admin yang boleh menyentuh rename/pengosongan; edit izin
    // non-kosong oleh non-super tetap dibatasi grantErr di atas.
    const existingIsReserved = isReservedRoleName(existing.name ?? "")
    if (existingIsReserved && !actor.roles.includes("super_admin")) {
      const newName = name.trim()
      if (newName !== (existing.name ?? newName)) {
        return `Peran sistem "${existing.name}" tidak dapat diganti nama oleh non-super_admin.`
      }
      if (permissionIds.length === 0) {
        return `Peran sistem "${existing.name}" tidak dapat dikosongkan izinnya oleh non-super_admin.`
      }
    }

    // Slug hanya dihitung ulang saat NAMA berubah: menyimpan daftar izin saja (mis. dari
    // matriks) tidak boleh mengubah URL peran — kalau tidak, tautan/bookmark lama mati
    // dan slug yang sudah tertulis di dokumen ikut berubah tanpa alasan.
    const nameChanged = name.trim() !== existing.name

    await tx.role.update({
      where: { id },
      data: {
        name: name.trim(),
        ...(nameChanged ? { slug: await nextSlugWithClient(tx as never, "role", name.trim(), { excludeId: id }) } : {}),
        permissions: {
          set: permissionIds.map((pid) => ({ id: pid })),
        },
      },
    })
    return null
  })
  if (guardError) {
    return { success: false, error: guardError }
  }

  revalidatePath("/pengaturan/peran")
  await logActivity("update", "Role", id, "Memperbarui peran")
  redirect("/pengaturan/peran")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateRole]", getErrorMessage(e) || e)
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { success: false, error: "Nama peran sudah dipakai. Pakai nama lain." }
    }
    throw e
  }
}

export async function deleteRole(id: number) {
  try {
  await requirePermission("manage_roles")

  const snapshot = await prisma.role.findUnique({
    where: { id },
    select: { name: true },
  })

  if (!snapshot) throw new Error("Role tidak ditemukan")

  // Protect the built-in super_admin role: must never be deleted.
  if (snapshot.name === "super_admin") {
    throw new Error("Peran super_admin adalah peran sistem dan tidak dapat dihapus")
  }

  // ApprovalWorkflowStep.roleId bare Int, no FK/relation to Role — raw delete
  // leaves dangling approver. assertStepApprover then finds no role, throws
  // "bukan approver" for everyone: pending approvals at that step deadlock
  // permanently (only super_admin bypass). Penulis langkah workflow memakai
  // kunci baris role yang sama; guard + delete wajib dinilai ulang di bawah
  // kunci itu, bukan dari snapshot.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM roles WHERE id = ${id} FOR UPDATE`
    const role = await tx.role.findUnique({
      where: { id },
      include: { users: true },
    })
    if (!role) throw new Error("Role tidak ditemukan")
    if (role.name === "super_admin") {
      throw new Error("Peran super_admin adalah peran sistem dan tidak dapat dihapus")
    }
    if (role.users.length > 0) {
      throw new Error(`Role "${role.name}" masih digunakan oleh ${role.users.length} user. Hapus assignment terlebih dahulu.`)
    }
    const usedBySteps = await tx.approvalWorkflowStep.count({ where: { roleId: id } })
    if (usedBySteps > 0) {
      throw new Error(`Role "${role.name}" masih digunakan oleh ${usedBySteps} langkah persetujuan. Ubah approver langkah tersebut terlebih dahulu.`)
    }
    await tx.role.delete({ where: { id } })
  })

  revalidatePath("/pengaturan/peran")
  await logActivity("delete", "Role", id, "Menghapus peran")
  redirect("/pengaturan/peran")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteRole]", getErrorMessage(e) || e)
    throw e
  }
}
