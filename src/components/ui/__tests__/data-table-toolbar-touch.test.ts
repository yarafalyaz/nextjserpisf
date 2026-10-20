import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("DataTable toolbar target sentuh 44px (360-430px)", () => {
  const src = source("src/components/ui/data-table.tsx")

  it("input cari setinggi 44px (h-11, bukan h-9 bawaan Input)", () => {
    const idx = src.indexOf('aria-label={searchPlaceholder}')
    expect(idx, "Input cari DataTable tidak ditemukan").toBeGreaterThan(0)
    const window = src.slice(Math.max(0, idx - 300), idx)
    // cn/tailwind-merge: h-11 di className menang dari h-9 bawaan Input
    expect(window).toContain('className="h-11 pl-9"')
  })

  it("tombol Kolom setinggi 44px (h-11)", () => {
    const line = src.split("\n").find((l) => l.includes("Kolom <"))
    expect(line, "tombol Kolom tidak ditemukan").toBeTruthy()
    const trigger = src
      .split("\n")
      .find((l) => l.includes('<Button variant="outline" className="ml-auto'))
    expect(trigger, "trigger Kolom tidak ditemukan").toBeTruthy()
    expect(trigger).toContain("h-11")
  })

  it("tombol Hapus Terpilih setinggi 44px (h-11, bukan size-sm h-8)", () => {
    const idx = src.indexOf("Hapus Terpilih")
    expect(idx, "tombol Hapus Terpilih tidak ditemukan").toBeGreaterThan(0)
    const window = src.slice(Math.max(0, idx - 300), idx)
    expect(window).toContain('className="h-11"')
    expect(window).not.toContain('size="sm"')
  })
})
