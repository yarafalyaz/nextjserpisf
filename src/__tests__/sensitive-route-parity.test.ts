import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { SENSITIVE_ROUTE_PERMISSIONS } from "@/lib/auth/sensitive-routes"
import { PERMISSIONS } from "@/lib/setup/base-data"

/**
 * Route pengaturan sensitif harus dijaga SATU ATURAN di tiga lapisan: proxy (redirect
 * dini), halaman (guard), dan server action (guard). Dulu proxy memakai nama role
 * hardcode (`super_admin`) sementara action-nya memakai permission, sehingga pemegang
 * permission itu bisa memanggil action langsung tanpa bisa membuka halamannya — dan
 * delegasi ke role lain (mis. `admin`) jadi mustahil tanpa membuka celah.
 */
const ROOT = process.cwd()

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8")

/** Action yang wajib memakai permission yang sama dengan route-nya. */
const ACTION_FILES_BY_PERMISSION: Record<string, string[]> = {
  manage_roles: ["src/actions/roles.actions.ts"],
  manage_users: ["src/actions/auth.actions.ts"],
  manage_settings: ["src/actions/database.actions.ts", "src/actions/activity-log.actions.ts"],
}

const pageFileFor = (routePrefix: string) =>
  `src/app/(dashboard)${routePrefix}/page.tsx`

describe("route pengaturan sensitif", () => {
  it("memakai permission yang benar-benar ada di daftar yang ditegakkan", () => {
    for (const [, permission] of SENSITIVE_ROUTE_PERMISSIONS) {
      expect(PERMISSIONS, `permission ${permission}`).toContain(permission)
    }
  })

  it("halamannya dijaga permission yang sama dengan proxy", () => {
    for (const [routePrefix, permission] of SENSITIVE_ROUTE_PERMISSIONS) {
      const source = read(pageFileFor(routePrefix))
      expect(source, `${routePrefix} harus requirePermission("${permission}")`).toContain(
        `requirePermission("${permission}")`,
      )
    }
  })

  it("action di belakangnya dijaga permission yang sama (bukan nama role)", () => {
    for (const [, permission] of SENSITIVE_ROUTE_PERMISSIONS) {
      for (const file of ACTION_FILES_BY_PERMISSION[permission] ?? []) {
        const source = read(file)
        // File action bisa memuat beberapa fungsi; semuanya harus pakai permission ini.
        expect(source, `${file} → ${permission}`).toContain(`requirePermission("${permission}")`)
        expect(source, `${file} tidak boleh memakai requireRole`).not.toMatch(/requireRole\(/)
      }
    }
  })

  it("setiap route punya file halaman (peta tidak menunjuk route hantu)", () => {
    for (const [routePrefix] of SENSITIVE_ROUTE_PERMISSIONS) {
      expect(fs.existsSync(path.join(ROOT, pageFileFor(routePrefix))), routePrefix).toBe(true)
    }
  })
})
