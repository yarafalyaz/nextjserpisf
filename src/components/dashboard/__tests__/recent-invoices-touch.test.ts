import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("RecentInvoicesTable target sentuh 44px (360-430px)", () => {
  const src = source("src/components/dashboard/recent-invoices-table.tsx")

  it("input Cari faktur tidak dipaksa h-8 (pakai h-11 mobile Input)", () => {
    const idx = src.indexOf('aria-label="Cari faktur atau pelanggan"')
    expect(idx).toBeGreaterThan(0)
    const window = src.slice(idx, idx + 200)
    expect(window).toContain('className="pl-8"')
    expect(window).not.toContain("h-8")
  })

  it("tombol Pilih kolom tabel setinggi 44px (min-h-11, bukan h-8)", () => {
    const idx = src.indexOf('aria-label="Pilih kolom tabel"')
    expect(idx).toBeGreaterThan(0)
    const window = src.slice(Math.max(0, idx - 200), idx)
    expect(window).toContain("min-h-11")
    expect(window).not.toContain('className="h-8 ')
  })

  it("tombol Halaman sebelumnya/berikutnya 44px (size-11, bukan size-10)", () => {
    for (const label of ["Halaman sebelumnya", "Halaman berikutnya"]) {
      const idx = src.indexOf(label)
      expect(idx, label).toBeGreaterThan(0)
      const window = src.slice(Math.max(0, idx - 400), idx)
      expect(window, label).toContain('className="size-11"')
      expect(window, label).not.toContain('className="size-10"')
    }
  })

  it("tidak ada size-10/h-8 tersisa di kontrol tabel faktur terbaru", () => {
    expect(src).not.toContain('className="size-10"')
    expect(src).not.toContain('className="h-8 pl-8"')
    expect(src).not.toContain('className="h-8 shrink-0"')
  })
})
