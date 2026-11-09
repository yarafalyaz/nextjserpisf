import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"

/**
 * Integritas bagan akun (Chart of Accounts) dan entri pembukuan (putaran 254)
 * — READ-ONLY, gate `RUN_DB_INTEGRATION=1`.
 *
 * Menguji invarian struktur akuntansi yang mendasari seluruh laporan keuangan:
 *
 *  1. Struktur Bagan Akun (COA):
 *     - Kode akun (`accounts.code`) unik tanpa duplikasi antar baris hidup.
 *     - Relasi pohon hirarki akun (`parent_id`) tidak boleh menunjuk akun yang tidak ada (anti-broken parent).
 *     - Hirarki pohon akun bebas dari loop/siklus melingkar (`circular parent-child hierarchy`).
 *     - Saldo normal akun (`normal_balance`): Akun tipe ASSET & EXPENSE wajib bersaldo normal `debit`,
 *       sedangkan akun tipe LIABILITY, EQUITY & REVENUE wajib bersaldo normal `credit`.
 *  2. Entri Jurnal (`journal_entries`):
 *     - Setiap entri pembukuan wajib menunjuk akun (`account_id`) dan jurnal (`journal_id`) yang benar-benar ada.
 *     - Setiap baris entri pembukuan tidak boleh memiliki debit negatif, kredit negatif, bernilai nol di kedua sisi,
 *       atau memiliki nilai positif di kedua sisi sekaligus (strict one-sided double entry).
 */

const SKIP = process.env.RUN_DB_INTEGRATION !== "1"

describe("integritas bagan akun (COA) dan entri pembukuan (DB, read-only)", () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it.skipIf(SKIP)(
    "hirarki dan integritas bagan akun (COA): kode unik, parent valid, bebas siklus, saldo normal tepat",
    async () => {
      // 1. Kode akun duplikat di baris hidup
      const duplicateCodes = await prisma.$queryRaw<
        Array<{ code: string; count: number }>
      >`
        SELECT code, COUNT(*) AS count
        FROM accounts
        WHERE deleted_at IS NULL
        GROUP BY code
        HAVING count > 1;
      `

      expect(
        duplicateCodes,
        `Ditemukan kode akun duplikat di tabel accounts: ${JSON.stringify(
          duplicateCodes,
        )}`,
      ).toEqual([])

      // 2. parent_id menunjuk akun tidak ada
      const brokenParents = await prisma.$queryRaw<
        Array<{ id: number; code: string; parentId: number }>
      >`
        SELECT a.id, a.code, a.parent_id AS parentId
        FROM accounts a
        LEFT JOIN accounts p ON p.id = a.parent_id
        WHERE a.parent_id IS NOT NULL
          AND p.id IS NULL;
      `

      expect(
        brokenParents,
        `Ditemukan akun dengan parent_id yang tidak merujuk akun mana pun: ${JSON.stringify(
          brokenParents,
        )}`,
      ).toEqual([])

      // 3. Bebas dari siklus hirarki (circular parent reference)
      const allAccounts = await prisma.account.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, parentId: true },
      })
      const accountMap = new Map(allAccounts.map((a) => [a.id, a]))
      const cyclicAccounts: string[] = []

      for (const acc of allAccounts) {
        let current = acc
        const visited = new Set<number>()
        while (current.parentId !== null) {
          if (visited.has(current.id)) {
            cyclicAccounts.push(acc.code)
            break
          }
          visited.add(current.id)
          const parent = accountMap.get(current.parentId)
          if (!parent) break
          current = parent
        }
      }

      expect(
        cyclicAccounts,
        `Ditemukan akun yang terjebak dalam siklus hirarki melingkar: ${cyclicAccounts.join(
          ", ",
        )}`,
      ).toEqual([])

      // 4. Saldo normal konsisten dengan tipe akun
      const normalBalanceAnomalies = await prisma.account.findMany({
        where: {
          deletedAt: null,
          normalBalance: { not: null },
          OR: [
            {
              type: { in: ["ASSET", "EXPENSE"] },
              NOT: { normalBalance: { equals: "debit" } },
            },
            {
              type: { in: ["LIABILITY", "EQUITY", "REVENUE"] },
              NOT: { normalBalance: { equals: "credit" } },
            },
          ],
        },
        select: { id: true, code: true, type: true, normalBalance: true },
      })

      expect(
        normalBalanceAnomalies,
        `Ditemukan akun dengan saldo normal tidak selaras dengan tipenya: ${JSON.stringify(
          normalBalanceAnomalies,
        )}`,
      ).toEqual([])
    },
  )

  it.skipIf(SKIP)(
    "entri jurnal (journal_entries): tautan referensi akun/jurnal ada, debit/kredit non-negatif dan eksklusif satu sisi",
    async () => {
      // 1. Entri dengan foreign key akun atau jurnal putus
      const brokenEntries = await prisma.$queryRaw<
        Array<{
          entryId: number
          missingAccount: number
          missingJournal: number
        }>
      >`
        SELECT
          je.id AS entryId,
          CASE WHEN a.id IS NULL THEN 1 ELSE 0 END AS missingAccount,
          CASE WHEN j.id IS NULL THEN 1 ELSE 0 END AS missingJournal
        FROM journal_entries je
        LEFT JOIN accounts a ON a.id = je.account_id
        LEFT JOIN journals j ON j.id = je.journal_id
        WHERE a.id IS NULL OR j.id IS NULL;
      `

      expect(
        brokenEntries,
        `Ditemukan entri jurnal dengan account_id atau journal_id yang tidak ada: ${JSON.stringify(
          brokenEntries,
        )}`,
      ).toEqual([])

      // 2. Nilai debit / credit negatif, nol keduanya, atau positif keduanya
      const invalidAmounts = await prisma.$queryRaw<
        Array<{
          entryId: number
          journalId: number
          debit: number
          credit: number
        }>
      >`
        SELECT
          id AS entryId,
          journal_id AS journalId,
          debit,
          credit
        FROM journal_entries
        WHERE debit < 0
           OR credit < 0
           OR (debit = 0 AND credit = 0)
           OR (debit > 0 AND credit > 0);
      `

      expect(
        invalidAmounts,
        `Ditemukan entri jurnal dengan nominal debit/kredit yang melanggar aturan double-entry: ${JSON.stringify(
          invalidAmounts,
        )}`,
      ).toEqual([])
    },
  )
})
