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

  it("status-actions: Setujui/Tolak min-h-11 lalu sm:min-h-9, pill pakai StatusChip", () => {
    const src = source("src/components/ui/status-actions.tsx")
    expect(src.match(/className="min-h-11 sm:min-h-9"/g)?.length).toBe(2)
    expect(src).toContain("<StatusChip status={status} />")
    expect(src).not.toMatch(/text-\w+-600/)
    expect(src).not.toMatch(/bg-\w+\/20/)
  })

  it("void-button: Batalkan min-h-11", () => {
    const src = source("src/components/ui/void-button.tsx")
    expect(src).toMatch(/min-h-11/)
  })

  it("delete-button: Hapus icon-only min-h-11 min-w-11 lalu sm:min-h-9", () => {
    const src = source("src/components/ui/delete-button.tsx")
    expect(src).toContain('className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"')
  })

  it("form-attachment-upload: tombol hapus ber-::before -inset-2, tombol upload min-h-11", () => {
    const src = source("src/components/ui/form-attachment-upload.tsx")
    expect(src).toContain("before:absolute before:-inset-2 before:content-['']")
    expect(src).toContain('className="form-attachment-upload-btn min-h-11"')
  })

  it("transaction-attachments: unduh/hapus/upload min-h-11", () => {
    const src = source("src/components/ui/transaction-attachments.tsx")
    expect(src.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it("invoice-items-editor: hapus baris min-h-11 lalu sm:min-h-9", () => {
    const src = source("src/components/ui/invoice-items-editor.tsx")
    expect(src).toContain("min-h-11 px-2 text-danger hover:text-danger/80 sm:min-h-9")
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
