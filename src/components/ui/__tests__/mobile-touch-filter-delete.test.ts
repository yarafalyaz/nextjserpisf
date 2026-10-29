import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("FilterDrawer + DeleteButton target sentuh 44px (360-430px)", () => {
  it("trigger FilterDrawer mobile-only setinggi 44px (min-h-11, bukan size-sm h-8)", () => {
    const src = source("src/components/ui/filter-drawer.tsx")
    const line = src.split("\n").find((l) => l.includes('aria-label="Buka filter laci"'))
    expect(line, "trigger FilterDrawer tidak ditemukan").toBeTruthy()
    expect(line).toContain("min-h-11")
  })

  it("tombol Hapus icon-only DeleteButton 44px (min-h-11 min-w-11)", () => {
    const src = source("src/components/ui/delete-button.tsx")
    const idx = src.indexOf("aria-label={label}")
    expect(idx, "tombol Hapus tidak ditemukan").toBeGreaterThan(0)
    const window = src.slice(Math.max(0, idx - 200), idx)
    expect(window).toContain("min-h-11")
    expect(window).toContain("min-w-11")
  })

  it("DeleteButton terima label kontekstual opsional, default Hapus", () => {
    const src = source("src/components/ui/delete-button.tsx")
    expect(src).toContain('label = "Hapus"')
    expect(src).toContain("aria-label={label}")
  })
})
