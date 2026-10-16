/**
 * Seed `modules` and `module_actions` tables from src/lib/auth/modules.ts.
 *
 * Idempotent: upserts each module + its actions. Safe to re-run.
 *
 * Run: npx tsx prisma/seed-modules.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { seedModules } from "../src/lib/setup/modules"
import "dotenv/config"

const databaseUrl = process.env.DATABASE_URL
const adapter = databaseUrl
  ? new PrismaMariaDb(databaseUrl)
  : new PrismaMariaDb({
      socketPath: "/tmp/mysql.sock",
      user: "root",
      password: "",
      database: "yara_erp",
      connectionLimit: 5,
    })

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
