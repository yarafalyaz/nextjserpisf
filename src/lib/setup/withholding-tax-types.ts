import type { Prisma } from "@prisma/client"
import { WITHHOLDING_TAX_TYPES } from "./base-data"

/**
 * Seed jenis potongan PPh bawaan (`WITHHOLDING_TAX_TYPES`) dan tautkan ke akun
 * COA per kode. Idempoten per `code`: baris yang sudah ada (termasuk hasil edit
 * tenant) tidak pernah ditimpa — seed hanya mengisi instalasi yang belum punya.
 *
 * Dipakai wizard install; seed CLI (`prisma/seed.ts`) menjalankan SQL setara.
 */
export async function seedWithholdingTaxTypes(tx: Prisma.TransactionClient): Promise<number> {
  const codes = WITHHOLDING_TAX_TYPES.flatMap((t) =>
    [t.liabilityAccountCode, t.receivableAccountCode].filter((c): c is string => Boolean(c)),
  )
  const accounts = await tx.account.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  })
  const idByCode = new Map(accounts.map((a) => [a.code, a.id]))

  let created = 0
  for (const t of WITHHOLDING_TAX_TYPES) {
    const existing = await tx.withholdingTaxType.findFirst({
      where: { code: t.code },
      select: { id: true },
    })
    if (existing) continue
    await tx.withholdingTaxType.create({
      data: {
        code: t.code,
        name: t.name,
        rate: t.rate,
        liabilityAccountId: t.liabilityAccountCode ? (idByCode.get(t.liabilityAccountCode) ?? null) : null,
        receivableAccountId: t.receivableAccountCode ? (idByCode.get(t.receivableAccountCode) ?? null) : null,
      },
    })
    created++
  }
  return created
}
