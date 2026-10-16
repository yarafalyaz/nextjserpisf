import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Parity: inisiator alur persetujuan vs kolom `createdBy` di schema.
 *
 * Route `/api/workflow` menentukan inisiator dokumen dengan membaca kolom
 * `createdBy`. Kalau model yang dipetakan TIDAK punya kolom itu, Prisma melempar
 * validation error sehingga tombol Setujui selalu 500 — itu yang terjadi pada
 * Cuti & Lembur. Flag `hasCreatedBy: false` di MODULE_MAP mencegahnya, dan test
 * ini yang menjaga flag itu tetap sesuai kenyataan schema (termasuk saat modul
 * baru ditambahkan ke peta).
 */
const repoRoot = process.cwd()
const routeSource = fs.readFileSync(
  path.join(repoRoot, "src/app/api/workflow/[...path]/route.ts"),
  "utf8",
)
const schema = fs.readFileSync(path.join(repoRoot, "prisma/schema.prisma"), "utf8")

function parseModuleMap(): Array<{ modelType: string; hasCreatedBy: boolean }> {
  const entries: Array<{ modelType: string; hasCreatedBy: boolean }> = []
  const re = /\{\s*model:\s*"([^"]+)",\s*modelType:\s*"([^"]+)",\s*revalidate:\s*"([^"]+)"([^}]*)\}/g
  for (const match of routeSource.matchAll(re)) {
    entries.push({
      modelType: match[2],
      hasCreatedBy: !/hasCreatedBy:\s*false/.test(match[4]),
    })
  }
  return entries
}

function modelHasCreatedBy(model: string): boolean | null {
  const start = schema.indexOf(`model ${model} `)
  if (start === -1) return null
  const end = schema.indexOf("\n}", start)
  return /\n\s+createdBy\s/.test(schema.slice(start, end))
}

describe("approval initiator parity", () => {
  const entries = parseModuleMap()

  it("MODULE_MAP terbaca dari route", () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it("setiap modul menandai hasCreatedBy sesuai kolom createdBy di schema", () => {
    const problems: string[] = []
    for (const entry of entries) {
      const hasColumn = modelHasCreatedBy(entry.modelType)
      if (hasColumn === null) {
        problems.push(`${entry.modelType}: model tidak ditemukan di prisma/schema.prisma`)
        continue
      }
      if (hasColumn && !entry.hasCreatedBy) {
        problems.push(`${entry.modelType}: schema PUNYA createdBy tapi MODULE_MAP menandai hasCreatedBy: false`)
      }
      if (!hasColumn && entry.hasCreatedBy) {
        problems.push(
          `${entry.modelType}: kolom createdBy TIDAK ADA — tombol Setujui akan 500. Tambahkan hasCreatedBy: false di MODULE_MAP.`,
        )
      }
    }
    expect(problems, problems.join("\n")).toEqual([])
  })
})
