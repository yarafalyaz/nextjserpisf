"use client"

import { useSession } from "next-auth/react"

export interface BulkDeleteSessionUser {
  permissions?: string[] | null
  roles?: string[] | null
}

/**
 * Apakah pengguna boleh melihat aksi "Hapus Terpilih"?
 *
 * `permission` undefined = kontrol tidak digerbang (pemanggil lama yang
 * belum bermigrasi). Bermigrasi: hanya super_admin atau pemegang izin
 * delete model itu yang melihat tombol — pola sama dengan gerbang per baris
 * di ActionDropdown. `user` null (belum ada sesi) = sembunyikan: server
 * tetap menolak, UI tidak menawarkan kontrol yang pasti gagal.
 */
export function canBulkDelete(user: BulkDeleteSessionUser | null | undefined, permission?: string): boolean {
  if (!permission) return true
  if (!user) return false
  if ((user.roles ?? []).includes("super_admin")) return true
  return (user.permissions ?? []).includes(permission)
}

/**
 * Versi hook untuk pemanggil: DataTable sendiri TIDAK memanggil ini.
 * useSession throw di luar SessionProvider pada NODE_ENV non-production,
 * dan DataTable juga dirender halaman/test tanpa provider — jadi tabel yang
 * butuh gerbang mengambil sesi lewat komponen pembungkus ini, tabel tanpa
 * gerbang tidak pernah menyentuh sesi.
 */
export function useBulkDeleteSessionUser(): BulkDeleteSessionUser | null {
  const { data: session } = useSession()
  return (session?.user as BulkDeleteSessionUser | undefined) ?? null
}
