/**
 * Label akun untuk layar ringkasan Mapping Akun.
 *
 * Layar ini adalah gerbang kesiapan: hijau berarti "akun ini akan menerima
 * jurnal". Karena itu daftar akun yang boleh dipakai untuk MENYELESAIKAN nama
 * harus definisi kanonis yang sama dengan picker `load-settings.ts` (aktif,
 * belum dihapus lunak, dan daun). Sebelum putaran 103 layar ini memakai
 * `{ isActive: true }` saja, sehingga mapping yang menunjuk akun terhapus atau
 * induk tampil hijau "tersambung" padahal `journal.service` menolak
 * mempostingnya — tanda siap yang salah.
 */

/** Mapping belum pernah diset (id kosong). */
export const MAPPING_UNSET = "Belum diset"

/** Mapping terisi tetapi akunnya tidak bisa dipakai (terhapus/nonaktif/induk). */
export const MAPPING_INVALID = "Akun tidak valid — set ulang"

export interface MappingAccountRow {
  id: number
  code: string
  name: string
}

/** Akun yang sah untuk posting: aktif, belum dihapus, dan tanpa anak. */
export function usableMappingAccounts<
  T extends MappingAccountRow & { _count?: { children: number } },
>(rows: readonly T[]): MappingAccountRow[] {
  return rows
    .filter((row) => (row._count?.children ?? 0) === 0)
    .map(({ id, code, name }) => ({ id, code, name }))
}

export function mappingAccountLabel(
  id: number | null | undefined,
  accounts: readonly MappingAccountRow[],
): string {
  if (!id) return MAPPING_UNSET
  const account = accounts.find((row) => row.id === id)
  return account ? `${account.code} - ${account.name}` : MAPPING_INVALID
}

/** Hijau hanya bila mapping terisi DAN akunnya masih bisa diposting. */
export function isMappingFilled(label: string): boolean {
  return label !== MAPPING_UNSET && label !== MAPPING_INVALID
}
