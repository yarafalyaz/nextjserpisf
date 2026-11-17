import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * Penjaga: rantai impor dari sebuah Client Component ("use client") TIDAK BOLEH
 * mencapai modul server-only.
 *
 * Insiden 2026-11-17: build produksi gagal total karena
 * `customer-vehicles-table.tsx` ("use client") mengimpor `CanCreate` →
 * `@/lib/auth/permissions` → `@/lib/auth/auth` (NextAuth) → `@prisma/client` +
 * `crypto` → `node:fs`, lalu Turbopack menolak: "the chunking context (unknown)
 * does not support external modules (request: node:fs)". Cacat kedua sekelas:
 * `asset-use-status.ts` memakai `Prisma.Decimal` (nilai runtime) padahal label
 * tampilnya dikonsumsi client lewat `asset-use-status-display.ts`. tsc, eslint,
 * dan tes unit sama sekali tidak melihat batas ini — hanya build yang memerah,
 * di ujung pipeline. Penjaga ini memindahkannya ke detik pertama.
 *
 * Aturan (impor transitif):
 *   1. Mulai dari setiap berkas `"use client"` di `src/`.
 *   2. Telusuri impor relatif dan `@/` (→ `src/`) secara transitif.
 *   3. Dilarang mencapai `node:fs` / `node:fs/promises` / `node:crypto` (juga
 *      tanpa prefiks `node:`) atau `@prisma/client` sebagai NILAI RUNTIME, atau
 *      `src/lib/auth/auth.ts` / `src/lib/auth/permissions.ts`.
 *   4. `import type` / `export type` (dan named import yang seluruhnya `type`)
 *      dikecualikan: dihapus saat kompilasi, jadi tidak menarik modul ke bundle.
 *   5. Berkas `"use server"` adalah BATAS RPC, bukan impor biasa: React
 *      menggantinya dengan referensi aksi dan isinya tetap di server. Menelusuri
 *      ke dalamnya melaporkan ~3000 rantai palsu (terukur di main tip).
 *   6. `src/app/api/**` tidak ditelusuri (route handler bukan client).
 */

const ROOT = process.cwd()
const SRC = path.join(ROOT, "src")
const API_DIR = path.join(SRC, "app", "api")
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"]

const AUTH_TARGETS = new Set(
  [path.join(SRC, "lib", "auth", "auth.ts"), path.join(SRC, "lib", "auth", "permissions.ts")].map(normalize)
)

function normalize(file: string): string {
  return path.resolve(file).split(path.sep).join("/")
}

function isUnder(file: string, dir: string): boolean {
  const f = normalize(file)
  return f === normalize(dir) || f.startsWith(normalize(dir) + "/")
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue
      walk(full, out)
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      out.push(full)
    }
  }
  return out
}

/** Resolusi specifier relatif / `@/` ke berkas nyata; `undefined` untuk paket pihak ketiga. */
function resolveSpecifier(fromFile: string, specifier: string): string | undefined {
  let base: string
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2))
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier)
  else return undefined

  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext)]
  for (const ext of EXTENSIONS) candidates.push(path.join(base, "index" + ext))
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
}

/** Modul server-only yang dilarang di reach client (rule 3). */
function serverModuleFact(specifier: string): string | undefined {
  if (/^(node:)?fs(\/promises)?$/.test(specifier) || /^(node:)?crypto$/.test(specifier)) return specifier
  if (specifier === "@prisma/client") return "@prisma/client (Prisma.Decimal runtime)"
  return undefined
}

interface ModuleFacts {
  isClient: boolean
  /** `"use server"`: batas RPC, tidak ditelusuri isinya. */
  isServerAction: boolean
  /** Impor runtime (bukan type-only) menuju modul server atau berkas src. */
  imports: { target?: string; server?: string }[]
}

const factsCache = new Map<string, ModuleFacts>()

function readFacts(file: string): ModuleFacts {
  const cached = factsCache.get(file)
  if (cached) return cached

  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
  const facts: ModuleFacts = { isClient: false, isServerAction: false, imports: [] }

  for (const statement of source.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      if (statement.expression.text === "use client") facts.isClient = true
      if (statement.expression.text === "use server") facts.isServerAction = true
      continue
    }
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue

    const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined
    if (clause?.isTypeOnly) continue
    if (ts.isExportDeclaration(statement) && statement.isTypeOnly) continue

    const specifier = statement.moduleSpecifier
    if (!specifier || !ts.isStringLiteral(specifier)) continue

    // `import { type A } from …` / `export { type A } from …` juga type-only.
    const named = clause?.namedBindings
    if (named && ts.isNamedImports(named) && named.elements.length > 0) {
      if (named.elements.every((element) => element.isTypeOnly)) continue
    }

    const server = serverModuleFact(specifier.text)
    const target = resolveSpecifier(file, specifier.text)
    // Impor modul pihak ketiga yang bukan server-only: tidak relevan.
    if (!server && !target) continue
    facts.imports.push({ target, server })
  }

  factsCache.set(file, facts)
  return facts
}

/**
 * BFS dari setiap client component. Lintasan mencakup batas RPC sehingga
 * rantai yang dilaporkan menjelaskan sendiri mengapa aman (lihat `[use server]`).
 */
function findViolations(clientFiles: string[]): string[] {
  const violations: string[] = []
  const label = (file: string) => normalize(path.relative(ROOT, file))

  for (const entry of clientFiles) {
    const visited = new Set([normalize(entry)])
    const queue: string[][] = [[entry]]

    while (queue.length > 0) {
      const chain = queue.shift()!
      const current = chain[chain.length - 1]
      const facts = readFacts(current)
      if (facts.isServerAction) continue

      for (const edge of facts.imports) {
        if (edge.server) {
          violations.push([...chain.map(label), `!! ${edge.server}`].join(" -> "))
          continue
        }
        const next = edge.target!
        const key = normalize(next)
        if (visited.has(key)) continue
        if (isUnder(next, API_DIR)) continue
        if (AUTH_TARGETS.has(key)) {
          violations.push([...chain.map(label), `!! ${label(next)}`].join(" -> "))
          continue
        }
        visited.add(key)
        queue.push([...chain, next])
      }
    }
  }

  return violations
}

describe("batas client/server", () => {
  const clientFiles = walk(SRC).filter((file) => readFacts(file).isClient)

  it("memindai seluruh Client Component di src (bukan vakum)", () => {
    expect(clientFiles.length).toBeGreaterThan(200)
  })

  it("tidak ada rantai impor Client Component yang mencapai modul server-only", () => {
    expect(findViolations(clientFiles)).toEqual([])
  })
})
