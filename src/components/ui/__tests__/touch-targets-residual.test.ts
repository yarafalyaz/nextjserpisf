import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("residual target sentuh 44px", () => {
  it("calendar: hari/nav/dropdown bawa perluasan ::before", () => {
    const src = source("src/components/ui/shadcn/calendar.tsx")
    expect(src).toMatch(/day_button:[\s\S]*?before:absolute/)
    expect(src).toMatch(/button_previous:[\s\S]*?before:absolute/)
    expect(src).toMatch(/button_next:[\s\S]*?before:absolute/)
    expect(src).toContain("before:-inset-y-1.5")
  })

  it("dialog: tombol Tutup (X) 44px (size-11), footer Tutup min-h-11", () => {
    const src = source("src/components/ui/shadcn/dialog.tsx")
    expect(src).toContain("size-11")
    expect(src).toContain('className="min-h-11"')
  })

  it("alert-dialog: Aksi/Batal primitif min-h-11 (semua ConfirmDialog warisi)", () => {
    const src = source("src/components/ui/shadcn/alert-dialog.tsx")
    expect(src.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it("confirm-dialog: Batal/Konfirmasi min-h-11", () => {
    const src = source("src/components/ui/confirm-dialog.tsx")
    expect(src).toContain('className="min-h-11"')
    expect(src).toContain('"min-h-11"')
  })

  it("status-actions: Setujui/Tolak min-h-11, pill pakai StatusChip", () => {
    const src = source("src/components/ui/status-actions.tsx")
    expect(src.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(2)
    expect(src).toContain("<StatusChip status={status} />")
    expect(src).not.toMatch(/text-\w+-600/)
    expect(src).not.toMatch(/bg-\w+\/20/)
  })

  it("void-button: Batalkan min-h-11", () => {
    const src = source("src/components/ui/void-button.tsx")
    expect(src).toMatch(/min-h-11/)
  })

  it("data-table: sort bawa perluasan ::before; id pageSize unik per instance (useId)", () => {
    const src = source("src/components/ui/data-table.tsx")
    expect(src).toMatch(/before:inset-x-0 before:-inset-y-1\.5/)
    expect(src).toContain("useId()")
    expect(src).toContain("htmlFor={pageSizeId}")
    expect(src).toContain("id={pageSizeId}")
    expect(src).not.toContain('id="pageSize"')
    expect(src).not.toContain('htmlFor="pageSize"')
  })
})
