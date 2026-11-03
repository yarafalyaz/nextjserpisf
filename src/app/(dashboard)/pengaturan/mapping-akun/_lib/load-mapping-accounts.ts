import { prisma } from "@/lib/db/prisma"

import { usableMappingAccounts, type MappingAccountRow } from "./mapping-account-label"

/**
 * Akun yang boleh dipakai untuk menyelesaikan label Mapping Akun.
 *
 * Definisi kanonis yang sama dengan picker `pengaturan/ubah/_lib/load-settings.ts`
 * (putaran 94): hanya akun aktif, belum dihapus lunak, dan daun (tanpa anak).
 * Layar ringkasan memakai daftar yang sama supaya tanda "tersambung" tidak
 * pernah lebih longgar dari kemampuan posting yang sebenarnya.
 */
export async function loadMappingAccounts(): Promise<MappingAccountRow[]> {
  const rows = await prisma.account.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, _count: { select: { children: true } } },
  })
  return usableMappingAccounts(rows)
}
