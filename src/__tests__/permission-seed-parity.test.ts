import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

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
    const enforced = collect(/(?:requirePermission|hasPermission)\(\s*"([^"]+)"/g)
    expect(enforced.size).toBeGreaterThan(100)

    const missing = [...enforced.entries()]
      .filter(([permission]) => !seededPermissions.has(permission))
      .map(([permission, files]) => `${permission} (${files.join(", ")})`)

    expect(missing, `Permission dipakai kode tapi tidak di-seed:\n${missing.join("\n")}`).toEqual([])
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
})
