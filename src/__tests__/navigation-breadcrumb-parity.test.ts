import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Label breadcrumb HARUS sama dengan label menu untuk route yang sama.
 *
 * Kenapa: setiap halaman menulis breadcrumb-nya sendiri (`AppBreadcrumbs items={[...]}`),
 * jadi label gampang menyimpang dari `navigation.ts`. Saat audit, ditemukan 43
 * ketidakcocokan (mis. halaman Barang menulis "Item" padahal menunya "Barang";
 * beberapa halaman detail menulis nama grup alih-alih nama halamannya).
 *
 * Sumber kebenaran: `navigation.ts`. Item tanpa href (halaman aktif) dan label dinamis
 * (`{ label: title }`) dilewati karena bukan nama menu.
 */
const ROOT = process.cwd()

function navLabelsByHref(): Map<string, string> {
  const source = fs.readFileSync(path.join(ROOT, "src/components/layout/navigation.ts"), "utf8")
  const map = new Map<string, string>()
  for (const match of source.matchAll(/\{\s*label:\s*"([^"]+)",\s*href:\s*"([^"]+)"/g)) {
    // Grup menang bila ada dua entri dengan href sama (mis. /aset sebagai grup & leaf).
    if (!map.has(match[2])) map.set(match[2], match[1])
  }
  return map
}

function collectTsxFiles(): string[] {
  const roots = [path.join(ROOT, "src/app"), path.join(ROOT, "src/components")]
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(".tsx")) files.push(full)
    }
  }
  for (const root of roots) walk(root)
  return files
}

const navLabels = navLabelsByHref()

const mismatches: string[] = []
const labelHalamanBeda: string[] = []
for (const file of collectTsxFiles()) {
  const source = fs.readFileSync(file, "utf8")
  if (!source.includes("AppBreadcrumbs")) continue
  const block = source.match(/AppBreadcrumbs[\s\S]{0,200}?items=\{(\[[\s\S]*?\])\}/)
  if (!block) continue
  for (const item of block[1].matchAll(/\{([^{}]*)\}/g)) {
    const label = item[1].match(/label:\s*"([^"]+)"/)?.[1]
    const href = item[1].match(/href:\s*"([^"]+)"/)?.[1]
    if (!label || !href) continue
    const expected = navLabels.get(href)
    if (expected && expected !== label) {
      mismatches.push(`${path.relative(ROOT, file)} → ${href}: breadcrumb "${label}" vs menu "${expected}"`)
    }
  }
}

// Crumb terakhir halaman (tanpa href) = nama halaman itu sendiri, dan harus sama dengan
// nama menu bila route-nya memang terdaftar di menu. Ini yang dulu terlewat: halaman
// Barang menulis "Item" pada crumb terakhir padahal menunya "Barang".
for (const file of collectTsxFiles()) {
  if (!file.includes("page.tsx")) continue
  const route = "/" + path
    .relative(path.join(ROOT, "src/app/(dashboard)"), path.dirname(file))
    .split(path.sep)
    .join("/")
  if (route.includes("[") || route === "/.") continue
  const expected = navLabels.get(route)
  if (!expected) continue
  const source = fs.readFileSync(file, "utf8")
  const block = source.match(/AppBreadcrumbs[\s\S]{0,200}?items=\{(\[[\s\S]*?\])\}/)
  if (!block) continue
  const lastItem = [...block[1].matchAll(/\{([^{}]*)\}/g)].pop()
  if (!lastItem) continue
  const label = lastItem[1].match(/label:\s*"([^"]+)"/)?.[1]
  if (!label || /href:/.test(lastItem[1]) || label === expected) continue
  labelHalamanBeda.push(`${route} (${path.relative(ROOT, file)}): "${label}" vs menu "${expected}"`)
}

describe("paritas label breadcrumb ↔ menu", () => {
  it("setiap breadcrumb ber-href memakai label menu", () => {
    expect(mismatches).toEqual([])
  })

  it("crumb halaman aktif memakai nama menu halamannya", () => {
    expect(labelHalamanBeda).toEqual([])
  })

  it("menemukan daftar menu dan breadcrumb (penjaga tidak vakum)", () => {
    // Kalau pola regex berhenti cocok, tes tidak boleh "lulus" karena tidak menemukan apa pun.
    expect(navLabels.size).toBeGreaterThan(50)
  })
})
