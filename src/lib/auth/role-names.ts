/**
 * Satu-satunya sumber untuk nama role yang dipakai LANGSUNG oleh kode (bukan lewat
 * permission): role yang memberi akses lintas-cakupan (semua gudang / semua karyawan)
 * atau bypass total.
 *
 * Kenapa dipusatkan: sebelum ini daftarnya ditulis ulang di `warehouse-scope.ts` dan
 * `hr-scope.ts`, dan keduanya memuat nama yang **tidak pernah di-seed**
 * (`warehouse_manager`, `logistics`, `hr`, `hr_manager`) sehingga cabangnya mati dan
 * tidak ada yang menyadari. Kalau nama seperti itu hilang dari daftar, tidak ada yang
 * gagal — jadi butuh satu tempat + tes yang mengikatnya ke role yang benar-benar ada.
 */

/** Role dengan akses ke SEMUA gudang. */
export const WAREHOUSE_ALL_ACCESS_ROLES = ["super_admin", "admin"] as const

/** Role dengan akses ke SEMUA karyawan (scope HR). */
export const HR_ALL_ACCESS_ROLES = ["super_admin", "admin", "finance", "ga"] as const

/**
 * Nama role yang tidak boleh dibuat lewat UI Pengaturan → Peran.
 *
 * Berisi nama yang memberi akses istimewa (sekarang atau kalau nanti dimasukkan lagi
 * ke daftar akses di atas). Tanpa penjagaan ini, pemegang `manage_roles` bisa membuat
 * role bernama "admin" dan menaikkan hak aksesnya sendiri.
 */
export const RESERVED_ROLE_NAMES = [
  "super_admin",
  "admin",
  "warehouse_manager",
  "logistics",
  "hr",
  "hr_manager",
] as const

export function isReservedRoleName(name: string): boolean {
  return (RESERVED_ROLE_NAMES as readonly string[]).includes(name.trim().toLowerCase())
}
