import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("layout tambah grup-barang bergerbang create_item_groups", () => {
  it("layout ada dan menuntut create_item_groups sebelum render (pola bank/pajak)", () => {
    const layout = source("src/app/(dashboard)/master/grup-barang/tambah/layout.tsx")
    expect(layout).toContain('requirePermission("create_item_groups")')
    expect(layout).toContain("return children")
    // Pola sama persis dengan layout tambah bank/pajak yang sudah ada.
    expect(source("src/app/(dashboard)/master/bank/tambah/layout.tsx")).toContain('requirePermission("create_banks")')
    expect(source("src/app/(dashboard)/master/pajak/tambah/layout.tsx")).toContain('requirePermission("create_taxes")')
    // Izin selaras aksi yang dipanggil halaman client.
    expect(source("src/actions/master.actions.ts")).toContain('requirePermission("create_item_groups")')
  })
})
