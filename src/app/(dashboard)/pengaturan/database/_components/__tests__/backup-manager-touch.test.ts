import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("BackupManager target sentuh 44px (360-430px)", () => {
  const src = source("src/app/(dashboard)/pengaturan/database/_components/backup-manager.tsx")

  it("3 tombol ikon baris backup 44px (min-h-11 min-w-11, bukan icon-sm size-8)", () => {
    const hits = src.match(/min-h-11 min-w-11/g) ?? []
    expect(hits.length).toBe(3)
  })

  it("tombol ikon punya aria-label nama file (title saja tak cukup utk AT)", () => {
    expect(src).toContain('aria-label={`Unduh ${b.filename}`}')
    expect(src).toContain('aria-label={`Pulihkan ${b.filename}`}')
    expect(src).toContain('aria-label={`Hapus backup ${b.filename}`}')
  })

  it("ikon dekoratif aria-hidden", () => {
    expect(src).toContain('<Download className="size-4" aria-hidden="true" />')
    expect(src).toContain('<RotateCcw className="size-4" aria-hidden="true" />')
    expect(src).toContain('<Trash2 className="size-4 text-destructive" aria-hidden="true" />')
  })
})
