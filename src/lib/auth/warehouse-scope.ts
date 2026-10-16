import { prisma } from "@/lib/db/prisma"
import { WAREHOUSE_ALL_ACCESS_ROLES } from "@/lib/auth/role-names"

// Role yang memiliki akses ke semua gudang. Daftarnya ada di `role-names.ts` — dulu di
// sini tertulis `warehouse_manager`/`logistics` yang tidak pernah di-seed (cabang mati).
// Role `warehouse` BUKAN all-access: aksesnya ditentukan dari penugasan `UserWarehouse`.
const ALL_ACCESS_ROLES: readonly string[] = WAREHOUSE_ALL_ACCESS_ROLES

export type WarehouseScope =
  | { kind: "all" }
  | { kind: "assigned"; warehouseIds: number[] }
  | { kind: "none" }

interface ScopeUser {
  id: string
  roles: string[]
}

/**
 * Mendapatkan cakupan akses gudang (WarehouseScope) untuk pengguna.
 */
export async function getWarehouseScope(user: ScopeUser): Promise<WarehouseScope> {
  if (!user.roles || !Array.isArray(user.roles)) {
    return { kind: "none" }
  }

  if (user.roles.some((r) => ALL_ACCESS_ROLES.includes(r))) {
    return { kind: "all" }
  }

  // Cari gudang yang ditugaskan ke pengguna
  const assignments = await prisma.userWarehouse.findMany({
    where: { userId: Number(user.id) },
    select: { warehouseId: true },
  })

  if (assignments.length === 0) {
    return { kind: "none" }
  }

  return {
    kind: "assigned",
    warehouseIds: assignments.map((a: { warehouseId: number }) => a.warehouseId),
  }
}

/**
 * Validasi akses ke gudang tunggal. Melempar error jika tidak diizinkan.
 */
export function assertWarehouseAccess(scope: WarehouseScope, warehouseId: number): void {
  if (scope.kind === "all") return

  if (scope.kind === "none") {
    throw new Error("Anda tidak memiliki akses ke gudang mana pun.")
  }

  if (!scope.warehouseIds.includes(warehouseId)) {
    throw new Error(`Anda tidak memiliki akses ke gudang dengan ID ${warehouseId}.`)
  }
}

/**
 * Validasi akses ke beberapa gudang sekaligus. Melempar error jika ada yang tidak diizinkan.
 */
export function assertWarehouseAccessMulti(scope: WarehouseScope, warehouseIds: number[]): void {
  if (scope.kind === "all") return

  if (scope.kind === "none") {
    throw new Error("Anda tidak memiliki akses ke gudang mana pun.")
  }

  for (const id of warehouseIds) {
    if (!scope.warehouseIds.includes(id)) {
      throw new Error(`Anda tidak memiliki akses ke gudang dengan ID ${id}.`)
    }
  }
}
