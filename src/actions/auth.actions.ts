"use server"

import { signIn, signOut } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { requireAuth, requirePermission } from "@/lib/auth/permissions"
import { nextSlug } from "@/lib/utils/slug-db"
import { isNextRedirectError } from "@/lib/utils/error"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import {
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  updateProfileSchema,
  updateUserRolesSchema,
  updateUserWarehousesSchema,
} from "@/lib/validations/auth.schemas"
import { assertCanGrantRoles } from "@/lib/auth/role-grant"

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
  } catch (error) {
    const e = error as { type?: string; name?: string; message?: string } | null
    // "CredentialsSignin" = kredensial salah. `message` ikut dicek karena tes
    // melempar `new Error("CredentialsSignin")`. Error lain = masalah server,
    // bukan salah password — jangan menyesatkan pengguna.
    if (e?.type === "CredentialsSignin" || e?.name === "CredentialsSignin" || e?.message === "CredentialsSignin") {
      return { error: "Email atau password salah" }
    }
    console.error("[loginAction] signIn gagal:", error)
    return { error: "Gagal masuk karena masalah server. Coba lagi beberapa saat lagi." }
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

    // Security-relevant: record who changed their password and when. The new
    // password is deliberately NOT logged.
    await logActivity("update", "User", userId, "Mengubah password akun")

    revalidatePath("/profil")
    return { success: true }
  } catch (e) {
    if (isNextRedirectError(e)) throw e
    console.error("[changePassword]", e)
    return { error: "Terjadi kesalahan saat mengubah password" }
  }
}

export async function createUser(formData: FormData) {
  try {
    // Halaman /pengaturan/pengguna dijaga izin `manage_users` (proxy + halaman +
    // action memakai aturan yang sama); super_admin bypass.
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

    // Privilege-escalation guard: block granting any role (super_admin
    // included) whose permissions exceed the actor's own.
    const grantErr = await assertCanGrantRoles(actor, roleIds ?? [])
    if (grantErr) {
      return { error: grantErr }
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    // Use try/catch on create to handle race condition (duplicate email)
    const user = await prisma.user.create({
      data: {
        name,
        email,
        slug: await nextSlug("user", name),
        password: hashedPassword,
        isActive: true,
        roles: {
          connect: (roleIds ?? []).map((id) => ({ id })),
        },
      },
    })

    // Security-relevant: who created which user with which roles. Role names
    // are resolved for a human-readable trail (ids alone are opaque in audit).
    const grantedRoles = await prisma.role.findMany({
      where: { id: { in: roleIds ?? [] } },
      select: { name: true },
    })
    await logActivity(
      "create",
      "User",
      user.id,
      `Membuat pengguna ${email} (role: ${grantedRoles.map((r) => r.name).join(", ") || "tidak ada"})`,
    )

    revalidatePath("/pengaturan/pengguna")
    return { success: true, id: user.id }
  } catch (e) {
    if (isNextRedirectError(e)) throw e
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
    // any role (super_admin included) whose permissions exceed their own.
    const grantErr = await assertCanGrantRoles(actor, cleanRoleIds)
    if (grantErr) {
      return { error: grantErr }
    }

    // Guard super-admin terakhir + set role dalam SATU tx terkunci: kunci
    // semua baris user ber-role super_admin (FOR UPDATE, pola repo), lalu
    // nilai target dari bacaan sesudah kunci. Guard berlaku untuk target
    // mana pun — membatasinya ke demote-diri-sendiri membiarkan dua
    // super_admin terakhir saling menurunkan dan mengunci semua akses admin.
    const roleError = await prisma.$transaction(async (tx) => {
      // Kunci baris user target DULU: guard target di luar tx membaca snapshot,
      // promosi target menjadi super_admin yang commit di antaranya (lewat
      // updateUserRoles lain atau sync updateEmployee) tak boleh tertimpa
      // roles.set dari keputusan basi. Penulis lawan yang mengunci baris
      // employees saja terserialkan lewat kunci baris users ini.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
      const targetRoles = await tx.role.findMany({
        where: { users: { some: { id: userId } } },
        select: { id: true, name: true },
      })
      // Nilai ulang guard target dari bacaan terkunci (semantik sama dengan
      // assertCanModifyTarget): non-super_admin tak boleh mengubah akun yang
      // kini sudah super_admin.
      if (
        !actor.roles.includes("super_admin") &&
        targetRoles.some((r) => r.name === "super_admin")
      ) {
        return "Hanya super admin yang dapat mengubah atau menonaktifkan akun super admin"
      }
      const wasSuperAdmin = targetRoles.some((r) => r.name === "super_admin")
      const stillSuperAdmin = targetRoles.some((r) => r.name === "super_admin" && cleanRoleIds.includes(r.id))
      if (wasSuperAdmin && !stillSuperAdmin) {
        await tx.$queryRaw`SELECT u.id FROM users u INNER JOIN _UserRoles ur ON ur.B = u.id INNER JOIN roles r ON r.id = ur.A WHERE r.name = 'super_admin' ORDER BY u.id FOR UPDATE`
        const freshTargetRoles = await tx.role.findMany({
          where: { users: { some: { id: userId } } },
          select: { id: true, name: true },
        })
        const freshStillSuperAdmin = freshTargetRoles.some(
          (r) => r.name === "super_admin" && cleanRoleIds.includes(r.id),
        )
        if (freshTargetRoles.some((r) => r.name === "super_admin") && !freshStillSuperAdmin) {
          const others = await tx.user.count({
            where: { id: { not: userId }, roles: { some: { name: "super_admin" } } },
          })
          if (others === 0) {
            return "Tidak dapat mencabut role super admin terakhir"
          }
        }
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          roles: {
            set: cleanRoleIds.map((id) => ({ id })),
          },
        },
      })
      return null
    })
    if (roleError) {
      return { error: roleError }
    }

    // Security-relevant: role changes are privilege grants/revocations. Log the
    // before/after so a later privilege escalation is traceable.
    await logActivity(
      "update",
      "User",
      userId,
      `Mengubah role pengguna #${userId} menjadi: ${cleanRoleIds.join(", ") || "tidak ada"}`,
    )

    revalidatePath("/pengaturan/pengguna")
    return { success: true }
  } catch (e) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateUserRoles]", e)
    return { error: "Terjadi kesalahan saat memperbarui role" }
  }
}

/**
 * Menetapkan gudang yang boleh diakses pengguna (tabel `user_warehouses`).
 *
 * Ini SATU-SATUNYA jalur tulis tabel tersebut. `getWarehouseScope` menetapkan
 * cakupan gudang peran `warehouse` dari sini dan mengembalikan `{ kind: "none" }`
 * bila kosong — artinya sebelum aksi ini ada, peran `warehouse` yang sudah
 * di-seed TIDAK BISA diberi akses gudang mana pun (fail-closed, jadi bukan lubang
 * keamanan, tetapi perannya tidak terpakai).
 *
 * Semantiknya "ganti himpunan" seperti `updateUserRoles`: penugasan lama dihapus
 * dan diganti yang baru dalam SATU penulisan bertingkat, sehingga tidak ada saat
 * pengguna kehilangan semua akses karena dua penulisan terpisah.
 */
export async function updateUserWarehouses(userId: number, warehouseIds: number[]) {
  try {
    await requirePermission("manage_users")

    const parsed = updateUserWarehousesSchema.safeParse(warehouseIds)
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validasi gagal" }
    }
    const cleanIds = parsed.data

    // Setiap id harus gudang yang benar-benar ada. Tanpa pemeriksaan ini, id
    // asing (mis. permintaan yang dibuat tangan) akan menulis baris penugasan
    // yang tidak memberi akses apa pun: halaman pengguna menampilkan gudangnya,
    // tetapi `getWarehouseScope` tetap menolak — tampak diatur padahal tidak.
    if (cleanIds.length > 0) {
      const found = await prisma.warehouse.count({ where: { id: { in: cleanIds } } })
      if (found !== cleanIds.length) {
        return { error: "Ada gudang yang tidak ditemukan" }
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        userWarehouses: {
          deleteMany: {},
          create: cleanIds.map((warehouseId) => ({ warehouseId })),
        },
      },
    })

    // Security-relevant: penugasan gudang menentukan dokumen gudang mana yang
    // boleh dibaca/ditulis. Catat sebelum/sesudah agar pemberian akses tertelusuri.
    await logActivity(
      "update",
      "User",
      userId,
      `Mengubah akses gudang pengguna #${userId} menjadi: ${cleanIds.join(", ") || "tidak ada"}`,
    )

    revalidatePath("/pengaturan/pengguna")
    return { success: true }
  } catch (e) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateUserWarehouses]", e)
    return { error: "Terjadi kesalahan saat memperbarui akses gudang" }
  }
}

export async function toggleUserActive(userId: number) {
  try {
    // Fix #21: Add permission check
    const actor = await requirePermission("manage_users")

    // Self-guard: dilarang menonaktifkan akun sendiri.
    if (Number(actor.id) === userId) {
      return { error: "Tidak dapat menonaktifkan akun sendiri" }
    }
    const targetErr = await assertCanModifyTarget(actor.roles, userId)
    if (targetErr) {
      return { error: targetErr }
    }

    // Toggle atomik: kunci baris user (FOR UPDATE, pola repo), lalu nilai
    // ulang peran target dan isActive dari bacaan terkunci sebelum menulis
    // kebalikannya. Peran dari guard snapshot bisa basi bila target baru
    // dipromosikan menjadi super_admin.
    const toggleResult = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
      const fresh = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { isActive: true, roles: { select: { name: true } } },
      })
      if (
        !actor.roles.includes("super_admin") &&
        fresh.roles.some((r) => r.name === "super_admin")
      ) {
        return {
          error: "Hanya super admin yang dapat mengubah atau menonaktifkan akun super admin",
        }
      }
      await tx.user.update({
        where: { id: userId },
        data: { isActive: !fresh.isActive },
      })
      return { wasActive: fresh.isActive }
    })
    if ("error" in toggleResult) return { error: toggleResult.error }
    const wasActive = toggleResult.wasActive

    // Security-relevant: enabling/disabling an account. Log who toggled whom and
    // to which state so a denial-of-access is auditable.
    await logActivity(
      "update",
      "User",
      userId,
      `${wasActive ? "Menonaktifkan" : "Mengaktifkan"} pengguna #${userId}`,
    )

    revalidatePath("/pengaturan/pengguna")
    return { success: true }
  } catch (e) {
    if (isNextRedirectError(e)) throw e
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

    // Ganti email = ganti identitas login. Wajib verifikasi password ulang:
    // tanpa ini sesi yang dibajak (atau sesi tertinggal) bisa mengambil alih
    // akun lewat email baru milik penyerang.
    const current = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    if (email.toLowerCase() !== current.email.toLowerCase()) {
      const rawPassword = formData.get("currentPassword") ?? formData.get("password") ?? ""
      const passwordConfirm = typeof rawPassword === "string" ? rawPassword : ""
      if (!passwordConfirm) {
        return { error: "Password wajib diisi untuk mengganti email" }
      }
      const valid = await bcrypt.compare(passwordConfirm, current.password)
      if (!valid) {
        return { error: "Password salah" }
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { name, email },
    })

    // Identity change (name/email) on the user's own account — recording it
    // makes a later email-swap (login identity) traceable.
    await logActivity("update", "User", userId, `Memperbarui profil akun (${email})`)

    revalidatePath("/profil")
    revalidatePath("/")
    return { success: true }
  } catch (e) {
    if (isNextRedirectError(e)) throw e
    // Handle unique constraint violation (duplicate email)
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return { error: "Email sudah digunakan" }
    }
    console.error("[updateProfile]", e)
    return { error: "Terjadi kesalahan saat memperbarui profil" }
  }
}
