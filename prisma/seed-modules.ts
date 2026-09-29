/**
 * Seed `modules` and `module_actions` tables from src/lib/auth/modules.ts.
 *
 * Idempotent: upserts each module + its actions. Safe to re-run.
 *
 * Run: npx tsx prisma/seed-modules.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { MODULES } from "../src/lib/auth/modules"
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
  let moduleCount = 0
  let actionCount = 0
  for (const mod of MODULES) {
    // Upsert module
    const module_ = await prisma.module.upsert({
      where: { key: mod.key },
      create: {
        key: mod.key,
        name: mod.name,
        parentKey: mod.parentKey ?? null,
        route: mod.route ?? null,
        icon: mod.icon ?? null,
        order: mod.order,
      },
      update: {
        name: mod.name,
        parentKey: mod.parentKey ?? null,
        route: mod.route ?? null,
        icon: mod.icon ?? null,
        order: mod.order,
      },
    })
    moduleCount++

    // Upsert each action
    let order = 0
    for (const action of mod.actions) {
      await prisma.moduleAction.upsert({
        where: {
          moduleId_key: { moduleId: module_.id, key: action.key },
        },
        create: {
          moduleId: module_.id,
          key: action.key,
          permissionKey: action.permissionKey,
          label: action.label,
          order: order++,
        },
        update: {
          permissionKey: action.permissionKey,
          label: action.label,
        },
      })
      actionCount++
    }
  }

  console.log(`✓ Seeded ${moduleCount} modules, ${actionCount} module actions`)
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
