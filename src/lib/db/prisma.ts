import { PrismaClient } from "@prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createPrismaClient(): PrismaClient {
  // Pass config object directly - PrismaMariaDb creates its own pool internally
  const adapter = new PrismaMariaDb({
    socketPath: "/tmp/mysql.sock",
    user: "root",
    password: "",
    database: "yara_erp",
    connectionLimit: 10,
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

export type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>
