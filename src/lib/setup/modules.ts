import type { Prisma, PrismaClient } from "@prisma/client"
import { MODULES } from "@/lib/auth/modules"

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Menulis katalog RBAC (`modules` + `module_actions`) dari `src/lib/auth/modules.ts`.
 * Idempoten (upsert per `permissionKey`), aman dijalankan dari `prisma/seed-modules.ts`,
 * `prisma/seed.ts`, dan installer.
 *
 * Baris `module_actions` di-prune: permission yang sudah tidak ada di katalog dihapus,
 * supaya katalog DB tidak bisa drift dari daftar permission yang berlaku.
 */
export async function seedModules(db: Db): Promise<{ modules: number; actions: number; pruned: number }> {
  let modules = 0
  let actions = 0
  let pruned = 0

  for (const mod of MODULES) {
    const module_ = await db.module.upsert({
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
    modules++

    let order = 0
    for (const action of mod.actions) {
      await db.moduleAction.upsert({
        where: {
          moduleId_permissionKey: { moduleId: module_.id, permissionKey: action.permissionKey },
        },
        create: {
          moduleId: module_.id,
          key: action.key,
          resource: action.resource,
          permissionKey: action.permissionKey,
          label: action.label,
          order: order++,
        },
        update: {
          key: action.key,
          resource: action.resource,
          label: action.label,
          order: order++,
        },
      })
      actions++
    }

    const removed = await db.moduleAction.deleteMany({
      where: {
        moduleId: module_.id,
        permissionKey: { notIn: mod.actions.map((a) => a.permissionKey) },
      },
    })
    pruned += removed.count
  }

  return { modules, actions, pruned }
}
