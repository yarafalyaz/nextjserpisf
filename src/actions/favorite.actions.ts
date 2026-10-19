"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { parseFormData } from "@/lib/validations/parse-form"
import { favoriteTransactionSchema } from "@/lib/validations/favorite.schemas"

const REVALIDATE = "/pengaturan/transaksi-favorit"

/**
 * Favorit bersifat per pengguna: semuanya memakai `userId` dari sesi, bukan dari
 * form, sehingga satu pengguna tidak bisa menambah/menghapus favorit orang lain
 * walau id-nya dikirim.
 */
export async function createFavoriteTransaction(formData: FormData) {
  try {
    const user = await requirePermission("manage_favorite_transactions")
    const userId = Number(user.id)

    const parsed = parseFormData(favoriteTransactionSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const { label, href } = parsed.data

    const existing = await prisma.favoriteTransaction.findFirst({
      where: { userId, href },
      select: { id: true },
    })
    if (existing) return { success: false, error: "Tautan itu sudah ada di daftar favorit." }

    const created = await prisma.favoriteTransaction.create({
      data: { userId, label, href },
    })

    await logActivity("create", "FavoriteTransaction", created.id, `Menambah transaksi favorit: ${label}`)
    revalidatePath(REVALIDATE)
    return { success: true, id: created.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createFavoriteTransaction]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteFavoriteTransaction(id: number) {
  try {
    const user = await requirePermission("manage_favorite_transactions")

    // Cek kepemilikan sekaligus eksistensi: `findFirst` dengan userId memastikan
    // penghapusan lintas pengguna gagal walau id-nya benar.
    const favorite = await prisma.favoriteTransaction.findFirst({
      where: { id, userId: Number(user.id) },
      select: { id: true, label: true },
    })
    if (!favorite) return { success: false, error: "Favorit tidak ditemukan." }

    await prisma.favoriteTransaction.delete({ where: { id: favorite.id } })

    await logActivity("delete", "FavoriteTransaction", id, `Menghapus transaksi favorit: ${favorite.label}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteFavoriteTransaction]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
