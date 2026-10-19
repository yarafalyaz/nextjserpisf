/**
 * Seed `modules` and `module_actions` tables from src/lib/auth/modules.ts.
 *
 * Idempotent: upserts each module + its actions. Safe to re-run.
 *
 * Run: ./node_modules/.bin/tsx prisma/seed-modules.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { seedModules } from "../src/lib/setup/modules"
import "dotenv/config"

const DATABASE_SOCKET_PATH = process.env.DATABASE_SOCKET_PATH
// S5443: tidak ada fallback socket /tmp yang dapat ditulis publik. Socket hanya
// dari DATABASE_SOCKET_PATH (env operator) atau dari query
// `socketPath`/`socket` di DATABASE_URL. Tanpa keduanya, DATABASE_URL wajib ada.
const databaseUrl = process.env.DATABASE_URL
let adapter
if (databaseUrl) {
  adapter = new PrismaMariaDb(databaseUrl)
} else if (DATABASE_SOCKET_PATH) {
  adapter = new PrismaMariaDb({
    socketPath: DATABASE_SOCKET_PATH,
    user: "root",
    password: "",
    database: "yara_erp",
    connectionLimit: 5,
  })
} else {
  throw new Error(
    "DATABASE_URL wajib diisi (atau set DATABASE_SOCKET_PATH ke socket MySQL lokal)"
  )
}

const prisma = new PrismaClient({ adapter })

async function main() {
  const { modules, actions, pruned } = await seedModules(prisma)
  console.log(`✓ Seeded ${modules} modules, ${actions} module actions, ${pruned} baris usang dihapus`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
