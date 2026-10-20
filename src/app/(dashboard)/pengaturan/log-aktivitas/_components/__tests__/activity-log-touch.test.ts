import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("ActivityLogTable target sentuh 44px (360-430px)", () => {
  const src = source("src/app/(dashboard)/pengaturan/log-aktivitas/_components/activity-log-table.tsx")

  it("tombol Lihat rincian 44px, bukan size-10 (40px)", () => {
    expect(src).toContain('className="size-11 p-0"')
    expect(src).not.toContain('className="size-10 p-0"')
  })

  it("link Ekspor CSV 44px, bukan h-8 (32px)", () => {
    expect(src).toContain("inline-flex h-11 items-center")
    expect(src).not.toContain("inline-flex h-8 items-center")
  })

  it("aria-label tetap + ikon dekoratif aria-hidden", () => {
    expect(src).toContain('aria-label="Lihat rincian perubahan"')
    expect(src).toContain('<Eye className="h-3.5 w-3.5" aria-hidden="true" />')
    expect(src).toContain('<Download className="h-3.5 w-3.5" aria-hidden="true" />')
  })
})
