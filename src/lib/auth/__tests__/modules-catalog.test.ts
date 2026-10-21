import { describe, expect, it } from "vitest"

import { CATALOG_VERB_ORDER, MODULE_ACTIONS } from "../module-catalog.generated"
import { MODULES } from "../modules"
import { PERMISSIONS, type PermissionName } from "@/lib/setup/base-data"

/**
 * Katalog izin adalah satu-satunya sensor "permission mana yang ada di aplikasi".
 * Tes ini menjaga paritas DUA ARAH dengan `PERMISSIONS` (daftar yang benar-benar
 * ditegakkan `requirePermission()`), supaya katalog tidak bisa drift lagi seperti
 * sebelumnya (80 dari 301 terpetakan, sisanya tak terlihat di UI).
 */
const allActions = Object.entries(MODULE_ACTIONS).flatMap(([moduleKey, actions]) =>
  actions.map((action) => ({ ...action, moduleKey })),
)
const permissionNames = allActions.map((a) => a.permissionKey)

describe("katalog izin (module-catalog.generated.ts)", () => {
  it("memuat SETIAP permission yang ditegakkan, tanpa kecuali", () => {
    const inCatalog = new Set(permissionNames)
    const missing = PERMISSIONS.filter((name) => !inCatalog.has(name))
    expect(missing).toEqual([])
  })

  it("tidak memuat permission yang tidak ada di daftar yang ditegakkan", () => {
    const known = new Set(PERMISSIONS)
    const extra = [...new Set(permissionNames)].filter((name) => !known.has(name as PermissionName))
    expect(extra).toEqual([])
  })

  it("tidak ada permission ganda (satu permission = satu baris matriks)", () => {
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const action of allActions) {
      if (seen.has(action.permissionKey)) duplicates.push(action.permissionKey)
      else seen.set(action.permissionKey, action.moduleKey)
    }
    expect(duplicates).toEqual([])
  })

  it("mengikuti invarian permissionKey = verba + '_' + entitas", () => {
    const broken = allActions
      .filter((a) => a.permissionKey !== `${a.key}_${a.resource}`)
      .map((a) => `${a.permissionKey} (key=${a.key}, resource=${a.resource})`)
    expect(broken).toEqual([])
  })

  it("memakai verba yang dikenal sebagai kolom matriks", () => {
    const unknown = allActions
      .filter((a) => !CATALOG_VERB_ORDER.includes(a.key))
      .map((a) => `${a.permissionKey} → ${a.key}`)
    expect(unknown).toEqual([])
  })

  it("setiap modul punya aksi, dan setiap aksi punya label", () => {
    for (const [moduleKey, actions] of Object.entries(MODULE_ACTIONS)) {
      expect(actions.length, `modul ${moduleKey}`).toBeGreaterThan(0)
      for (const action of actions) expect(action.label, action.permissionKey).toBeTruthy()
    }
  })

  it("label entitas unik dalam satu modul (baris matriks tidak ambigu)", () => {
    for (const [moduleKey, actions] of Object.entries(MODULE_ACTIONS)) {
      const byResource = new Map<string, Set<string>>()
      for (const action of actions) {
        const labels = byResource.get(action.resource) ?? new Set<string>()
        labels.add(action.label)
        byResource.set(action.resource, labels)
      }
      const conflicting = [...byResource.entries()]
        .filter(([, labels]) => labels.size > 1)
        .map(([resource]) => `${moduleKey}:${resource}`)
      expect(conflicting).toEqual([])
    }
  })

  it("MODULES menyusun aksinya dari katalog (metadata + katalog sinkron)", () => {
    expect(MODULES.length).toBe(Object.keys(MODULE_ACTIONS).length)
    for (const mod of MODULES) {
      expect(mod.actions, mod.key).toBe(MODULE_ACTIONS[mod.key])
    }
  })
})
