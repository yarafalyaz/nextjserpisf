
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("DataTable pagination target sentuh 44px (360-430px)", () => {
  const src = source("src/components/ui/data-table.tsx")

  it("select Baris per halaman setinggi 44px (h-11, bukan h-8)", () => {
    const trigger = src
      .split("\n")
      .find((line) => line.includes('aria-label="Baris per halaman"'))
    expect(trigger, "SelectTrigger pageSize tidak ditemukan").toBeTruthy()
    expect(trigger).toContain('className="h-11 w-[70px]"')
    expect(trigger).not.toContain("h-8")
  })

  it("tombol Halaman sebelumnya/berikutnya 44px (size-11)", () => {
    // size-11 = 44px; size-10 = 40px dan size-9 = 36px di bawah target
    for (const label of ["Halaman sebelumnya", "Halaman berikutnya"]) {
      const idx = src.indexOf(label)
      expect(idx, label).toBeGreaterThan(0)
      const window = src.slice(Math.max(0, idx - 400), idx)
      expect(window, label).toContain('className="size-11"')
    }
  })

  it("tidak ada tombol paginasi size-10 tersisa di nav paginasi", () => {
    const nav = src.slice(src.indexOf('aria-label="Navigasi halaman tabel"'))
    const navBlock = nav.slice(0, nav.indexOf("</nav>"))
    expect(navBlock).not.toContain("size-10")
    expect(navBlock).not.toContain('className="h-8 ')
  })
})
