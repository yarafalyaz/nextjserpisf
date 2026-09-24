import { PrismaClient, Prisma } from "@prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import "@/lib/env" // validate env at startup
import { withSoftDeleteFilter } from "./soft-delete"

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
  basePrisma?: PrismaClient
}

function createPrismaClient(): PrismaClient {
  const adapter = process.env.DATABASE_URL
    ? new PrismaMariaDb(process.env.DATABASE_URL)
    : new PrismaMariaDb({
        socketPath: "/tmp/mysql.sock",
        user: "root",
        password: "",
        database: "yara_erp",
        connectionLimit: 10,
      })

  return new PrismaClient({ adapter })
}

/**
 * Unfiltered client. Use it when a query must see soft-deleted rows (uniqueness
 * checks that must not collide with a deleted record, audit/inspection queries).
 */
export const basePrisma = globalForPrisma.basePrisma ?? createPrismaClient()

/**
 * Application client: `findMany` and `count` automatically exclude
 * soft-deleted rows for models that declare `deletedAt` (see ./soft-delete.ts
 * for the rationale and the deliberate boundaries). An explicit `deletedAt` in
 * the caller's `where` always wins.
 *
 * Verified against the database: the filter applies to the model delegates AND
 * to the transaction client inside `prisma.$transaction(async (tx) => ...)`, so
 * pass `deletedAt` explicitly (or use `basePrisma`) when a read must see deleted
 * rows from inside a transaction.
 */
const extendedPrisma = basePrisma.$extends({
  name: "soft-delete-filter",
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        return query(withSoftDeleteFilter(model, args))
      },
      async count({ model, args, query }) {
        return query(withSoftDeleteFilter(model, args))
      },
    },
  },
})

// The extension only intercepts two read operations, so the public shape is a
// plain PrismaClient: keeping that type means every existing call site (and its
// argument types) stays valid.
export const prisma = (globalForPrisma.prisma ?? extendedPrisma) as unknown as PrismaClient

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.basePrisma = basePrisma
}

export type TxClient = Prisma.TransactionClient
