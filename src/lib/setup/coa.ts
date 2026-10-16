import type { Prisma } from "@prisma/client"
import { ACCURATE_TYPE_TO_ACCOUNT_TYPE, CHART_OF_ACCOUNTS } from "./base-data"

/**
 * Membuat bagan akun dari `CHART_OF_ACCOUNTS`.
 *
 * Akun induk dibuat LEBIH DULU agar setiap anak bisa langsung menempel ke
 * `parentId`-nya — tanpa itu, hierarki (dan opsi laporan "Tampilkan Akun
 * Induk/Anak") tidak akan terbentuk.
 *
 * Dipakai bersama oleh instalasi pertama kali (`installBaseData`) dan seed CLI
 * (`prisma/seed.ts`) supaya keduanya tidak bisa berbeda hasil.
 */
export async function createChartOfAccounts(tx: Prisma.TransactionClient): Promise<number> {
  const roots = CHART_OF_ACCOUNTS.filter(([, , , parent]) => !parent)
  const children = CHART_OF_ACCOUNTS.filter(([, , , parent]) => Boolean(parent))

  await tx.account.createMany({
    data: roots.map(([code, name, reportGroup]) => ({
      code,
      name,
      reportGroup,
      type: ACCURATE_TYPE_TO_ACCOUNT_TYPE[reportGroup],
    })),
    skipDuplicates: true,
  })

  // Peta kode → id setelah induk tersimpan (createMany tidak mengembalikan id).
  const idByCode = new Map(
    (await tx.account.findMany({ select: { id: true, code: true } })).map((row) => [row.code, row.id]),
  )

  await tx.account.createMany({
    data: children.map(([code, name, reportGroup, parentCode]) => ({
      code,
      name,
      reportGroup,
      type: ACCURATE_TYPE_TO_ACCOUNT_TYPE[reportGroup],
      parentId: idByCode.get(parentCode) ?? null,
    })),
    skipDuplicates: true,
  })

  return CHART_OF_ACCOUNTS.length
}
