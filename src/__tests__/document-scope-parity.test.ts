import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Parity: tabel scope dokumen (`lib/auth/document-scope.ts`) vs schema Prisma.
 *
 * Tabel itu sekarang menjadi SATU sumber batas gudang untuk lampiran maupun
 * cetak. Kalau delegate/kolomnya salah tulis, penjagaannya jadi fail-closed
 * untuk semua orang (fitur mati) — atau lebih buruk, lolos. Test ini memastikan
 * setiap kolom yang didaftarkan benar-benar ada pada modelnya, dan kuncinya
 * memakai snake_case (bentuk yang dipakai route cetak setelah normalisasi).
 */
const repoRoot = process.cwd()
const scopeSource = fs.readFileSync(path.join(repoRoot, "src/lib/auth/document-scope.ts"), "utf8")
const schema = fs.readFileSync(path.join(repoRoot, "prisma/schema.prisma"), "utf8")

function parseTable(): Array<{ key: string; model: string; fields: string[] }> {
  const entries: Array<{ key: string; model: string; fields: string[] }> = []
  const re = /^\s{2}([a-z_]+):\s*\{\s*model:\s*"([^"]+)",\s*fields:\s*\[([^\]]*)\]\s*\},?$/gm
  for (const match of scopeSource.matchAll(re)) {
    entries.push({
      key: match[1],
      model: match[2],
      fields: [...match[3].matchAll(/"([^"]+)"/g)].map((m) => m[1]),
    })
  }
  return entries
}

function modelColumns(delegate: string): Set<string> | null {
  // Tabel memakai nama delegate Prisma (camelCase); schema memakai nama model
  // (PascalCase) — samakan bentuknya lebih dulu.
  const model = delegate.charAt(0).toUpperCase() + delegate.slice(1)
  const start = schema.indexOf(`model ${model} `)
  if (start === -1) return null
  const end = schema.indexOf("\n}", start)
  const body = schema.slice(start, end)
  return new Set([...body.matchAll(/^\s+([A-Za-z][A-Za-z0-9_]*)\s/gm)].map((m) => m[1]))
}

describe("document scope parity", () => {
  const entries = parseTable()

  it("tabel scope terbaca", () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it("kunci memakai snake_case (bentuk setelah normalisasi route cetak)", () => {
    for (const entry of entries) {
      expect(entry.key, entry.key).not.toContain("-")
    }
  })

  it("setiap kolom gudang ada di modelnya di schema", () => {
    const problems: string[] = []
    for (const entry of entries) {
      const columns = modelColumns(entry.model)
      if (!columns) {
        problems.push(`${entry.key}: model ${entry.model} tidak ada di schema.prisma`)
        continue
      }
      for (const field of entry.fields) {
        if (!columns.has(field)) {
          problems.push(`${entry.key}: kolom ${field} tidak ada pada model ${entry.model}`)
        }
      }
    }
    expect(problems, problems.join("\n")).toEqual([])
  })
})
