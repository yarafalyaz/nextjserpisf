import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Setiap model yang punya kolom `slug` harus terdaftar di dua tempat, kalau
 * tidak URL-nya diam-diam tetap memakai id angka:
 *
 *   1. `SLUGGED_MODELS` (src/lib/utils/slug-db.ts) — agar baris yang dibuat
 *      lewat aplikasi mendapat slug saat create/update.
 *   2. TABLE_SOURCES (scripts/backfill-slugs.mjs) — agar baris yang sudah ada
 *      ikut diisi; tanpa entri di sini, data lama tetap NULL selamanya.
 *
 * Sama seperti `permission-seed-parity.test.ts`, berkas sumber dibaca langsung:
 * satu-satunya sumber kebenaran kolom slug adalah schema Prisma.
 */

const root = path.resolve(__dirname, "../..")
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")

/** Model dengan `slug String?` beserta nama tabelnya. */
function slugModelsWithTables(): { model: string; table: string }[] {
  const models: { model: string; table: string }[] = []
  const blocks = schema.split(/\nmodel /).slice(1)
  for (const block of blocks) {
    const model = block.slice(0, block.indexOf(" ")).trim()
    const fields = block.slice(0, block.indexOf("\n}"))
    if (!/^\s{2}slug\s+String\?/m.test(fields)) continue
    const tableMap = block.match(/@@map\("([^"]+)"\)/)
    models.push({ model, table: tableMap ? tableMap[1] : model.toLowerCase() })
  }
  return models
}

/** Kunci logis yang diterima `nextSlug()` — camelCase dari nama model. */
function registryKeys(): Set<string> {
  const source = readFileSync(path.join(root, "src/lib/utils/slug-db.ts"), "utf8")
  const block = source.slice(source.indexOf("SLUGGED_MODELS"), source.indexOf("} as const"))
  return new Set([...block.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((match) => match[1]))
}

/** Tabel yang diisi skrip backfill. */
function backfilledTables(): Set<string> {
  const source = readFileSync(path.join(root, "scripts/backfill-slugs.mjs"), "utf8")
  const block = source.slice(source.indexOf("TABLE_SOURCES"), source.indexOf("function sql"))
  return new Set([...block.matchAll(/([a-z_]+):\s*"/g)].map((match) => match[1]))
}

const slugModels = slugModelsWithTables()

describe("cakupan slug", () => {
  it("menemukan model ber-slug di schema (penjaga tes itu sendiri)", () => {
    expect(slugModels.length).toBeGreaterThan(50)
  })

  it("setiap model ber-slug bisa ditulis aplikasi lewat nextSlug()", () => {
    const registry = registryKeys()
    const missing = slugModels
      .map(({ model }) => `${model} → ${model[0].toLowerCase()}${model.slice(1)}`)
      .filter((_, index) => {
        const { model } = slugModels[index]
        return !registry.has(`${model[0].toLowerCase()}${model.slice(1)}`)
      })
    expect(missing).toEqual([])
  })

  it("setiap tabel ber-slug ikut di-backfill (baris lama tidak tertinggal numerik)", () => {
    const covered = backfilledTables()
    const missing = slugModels.filter(({ table }) => !covered.has(table)).map(({ table }) => table)
    expect(missing).toEqual([])
  })
})
