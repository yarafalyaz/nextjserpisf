import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { ROUTE_PERMS } from "@/lib/auth/action-perms"
import { APPROVAL_REFERENCE_PERMISSIONS } from "@/lib/auth/approval-permissions"
import {
  ATTACHMENT_PERMISSION,
  ATTACHMENT_WRITE_PERMISSION,
} from "@/lib/auth/attachment-permission-maps"

/**
 * Guard for the bug class behind the "Key Figure Statistik is dead for every
 * non-super-admin" defect (and the 4 hidden row-action buttons): a permission
 * string that code enforces but prisma/seed.ts never inserts can never be held by
 * any role. `requirePermission()` then redirects the user out of the feature and
 * `hasPermission()` returns false forever - a silent, fail-closed regression that
 * is invisible to type-checking and to page-render smoke tests.
 *
 * This test fails loudly when src references a permission/role that the seed does
 * not create, so the two sides cannot drift apart again.
 */

const ROOT = process.cwd()
const SEED_PATH = join(ROOT, "prisma", "seed.ts")

/** Extract the string literals of an array declaration in seed.ts (comments stripped). */
function extractArray(source: string, declaration: string): string[] {
  const start = source.indexOf(declaration)
  if (start === -1) throw new Error(`seed.ts: declaration not found -> ${declaration}`)
  const end = source.indexOf("];", start)
  if (end === -1) throw new Error(`seed.ts: unterminated array -> ${declaration}`)
  const body = source
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1])
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

function collect(pattern: RegExp): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const file of walk(join(ROOT, "src"))) {
    const source = readFileSync(file, "utf8")
    for (const match of source.matchAll(pattern)) {
      const value = match[1]
      const relative = file.slice(ROOT.length + 1)
      found.set(value, [...(found.get(value) ?? []), relative])
    }
  }
  return found
}

const seedSource = readFileSync(SEED_PATH, "utf8")
const seededPermissions = new Set(extractArray(seedSource, "const permissions = ["))
const seededRoles = new Set(extractArray(seedSource, "const roles = ["))

describe("permission/role parity between src and prisma/seed.ts", () => {
  it("seeds a non-trivial permission and role catalogue", () => {
    // Guards the extractor itself: a parsing change must not silently make the
    // parity checks below vacuous.
    expect(seededPermissions.size).toBeGreaterThan(100)
    expect(seededRoles.size).toBeGreaterThan(3)
  })

  it("every requirePermission()/hasPermission() string exists as a seeded permission", () => {
    const enforced = collect(/(?:requirePermission|hasPermission)\(\s*["']([^"']+)["']/g)
    expect(enforced.size).toBeGreaterThan(100)

    const missing = [...enforced.entries()]
      .filter(([permission]) => !seededPermissions.has(permission))
      .map(([permission, files]) => `${permission} (${files.join(", ")})`)

    expect(missing, `Permission dipakai kode tapi tidak di-seed:\n${missing.join("\n")}`).toEqual([])
  })

  it("every permission passed to requireAnyPermission exists as a seeded permission", () => {
    const found = new Map<string, string[]>()
    for (const file of walk(join(ROOT, "src"))) {
      const source = readFileSync(file, "utf8")
      for (const callMatch of source.matchAll(/requireAnyPermission\(\s*\[([\s\S]*?)\]\s*\)/g)) {
        for (const m of callMatch[1].matchAll(/["']([^"']+)["']/g)) {
          const value = m[1]
          const relative = file.slice(ROOT.length + 1)
          found.set(value, [...(found.get(value) ?? []), relative])
        }
      }
      for (const declMatch of source.matchAll(/(?:const|let)\s+([A-Za-z0-9_]+PERMISSIONS?)\s*(?::\s*string\[\])?\s*=\s*\[([\s\S]*?)\]/g)) {
        for (const m of declMatch[2].matchAll(/["']([^"']+)["']/g)) {
          const value = m[1]
          const relative = file.slice(ROOT.length + 1)
          found.set(value, [...(found.get(value) ?? []), relative])
        }
      }
    }
    expect(found.size).toBeGreaterThan(10)

    const missing = [...found.entries()]
      .filter(([permission]) => !seededPermissions.has(permission))
      .map(([permission, files]) => `${permission} (${files.join(", ")})`)

    expect(missing, `Permission requireAnyPermission tapi tidak di-seed:\n${missing.join("\n")}`).toEqual([])
  })

  it("every requireRole()/hasRole() string exists as a seeded role", () => {
    const enforced = collect(/(?:requireRole|hasRole)\(\s*"([^"]+)"/g)

    const missing = [...enforced.entries()]
      .filter(([role]) => !seededRoles.has(role))
      .map(([role, files]) => `${role} (${files.join(", ")})`)

    expect(missing, `Role dipakai kode tapi tidak di-seed:\n${missing.join("\n")}`).toEqual([])
  })

  it("permission and role catalogues contain no duplicates", () => {
    const permissions = extractArray(seedSource, "const permissions = [")
    const roles = extractArray(seedSource, "const roles = [")
    const duplicates = (values: string[]) =>
      [...new Set(values.filter((value, index) => values.indexOf(value) !== index))]

    expect(duplicates(permissions)).toEqual([])
    expect(duplicates(roles)).toEqual([])
  })

  it("every permission referenced by ROUTE_PERMS/attachment maps exists as a seeded permission", () => {
    // ROUTE_PERMS and ATTACHMENT_WRITE_PERMISSION decide whether a row action /
    // upload affordance is rendered (ActionDropdown hides it unless the session
    // holds the permission). A value no seed row creates can never be held by a
    // role, so the button is hidden for every non-super-admin - the same
    // fail-closed class as an unseeded requirePermission(). This pins both
    // registries to the seeded catalogue.
    const referenced = new Map<string, string[]>()
    const add = (permission: string | undefined, source: string) => {
      if (!permission) return
      referenced.set(permission, [...(referenced.get(permission) ?? []), source])
    }

    for (const entry of ROUTE_PERMS) {
      add(entry.edit, `ROUTE_PERMS edit ${entry.prefix}`)
      add(entry.delete, `ROUTE_PERMS delete ${entry.prefix}`)
    }
    for (const [key, permission] of Object.entries(ATTACHMENT_PERMISSION)) {
      add(permission, `ATTACHMENT_PERMISSION ${key}`)
    }
    for (const [key, permission] of Object.entries(ATTACHMENT_WRITE_PERMISSION)) {
      add(permission, `ATTACHMENT_WRITE_PERMISSION ${key}`)
    }

    expect(referenced.size).toBeGreaterThan(50)

    const missing = [...referenced.entries()]
      .filter(([permission]) => !seededPermissions.has(permission))
      .map(([permission, sources]) => `${permission} (${sources.join(", ")})`)

    expect(missing, `Permission registry tapi tidak di-seed:\n${missing.join("\n")}`).toEqual([])
  })

  it("every permission in APPROVAL_REFERENCE_PERMISSIONS exists as a seeded permission", () => {
    // Approve/reject for a document type is gated by
    // APPROVAL_REFERENCE_PERMISSIONS[modelType] in BOTH approval.actions.ts and
    // the status-button route. An unseeded value there means no non-super-admin
    // can ever approve that document type (fail-closed) - exactly the bug class
    // this file guards.
    const missing = Object.entries(APPROVAL_REFERENCE_PERMISSIONS)
      .filter(([, permission]) => !seededPermissions.has(permission))
      .map(([modelType, permission]) => `${permission} (${modelType})`)

    expect(missing, `Permission approval tapi tidak di-seed:\n${missing.join("\n")}`).toEqual([])
  })

  it("employee loans are approved under a permission separate from create_loans", () => {
    // Separation of duties: raising a loan must not imply approving/disbursing
    // it. Pin the split so it cannot silently regress to create_loans.
    expect(APPROVAL_REFERENCE_PERMISSIONS.EmployeeLoan).toBe("approve_loans")
    expect(APPROVAL_REFERENCE_PERMISSIONS.EmployeeLoan).not.toBe("create_loans")
  })
})
