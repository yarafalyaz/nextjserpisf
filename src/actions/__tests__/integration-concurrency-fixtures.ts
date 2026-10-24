import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "@prisma/client"
import { describe } from "vitest"

/**
 * Boilerplate bersama tes integrasi konkurensi MySQL: env guard,
 * describe kondisional, factory client, dan barrier deferred.
 * vi.mock tidak terlibat di sini; helper murni konstruksi klien tes.
 */

export const INTEGRATION_DB_URL = process.env.INTEGRATION_DB_URL

export const describeIntegration = INTEGRATION_DB_URL ? describe : describe.skip

export function warnIntegrationSkip(label: string) {
  if (INTEGRATION_DB_URL) return
  console.warn(
    `[${label}] SKIP: INTEGRATION_DB_URL tidak diset — ` +
      "tes konkurensi MySQL 8 nyata tidak dijalankan (bukan lulus). " +
      "Set INTEGRATION_DB_URL ke DB tes termigrasi untuk menjalankannya.",
  )
}

// Prisma 7 MariaDB adapter menerima connection string / config; bentuk
// string sama dengan yang dipakai src/lib/db/prisma.ts (DATABASE_URL).
export function createTestClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaMariaDb(INTEGRATION_DB_URL as string),
  })
}

/** Deferred manual: barrier antar-langkah supaya interleaving deterministik. */
export function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
