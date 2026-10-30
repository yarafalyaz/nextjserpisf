import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * ROUND5-SCOPE: daftar dokumen gudang wajib menegakkan cakupan gudang
 * pengguna (sebelumnya hanya detail/action yang scoped, daftar membocorkan
 * dokumen semua gudang). Guard statis mengunci: scope dibaca, where
 * menapis warehouseId, dan scope "none" fail-closed (hasil kosong).
 */
function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("guard cakupan gudang halaman daftar (ROUND5-SCOPE)", () => {
  const singleWarehousePages = [
    "src/app/(dashboard)/inventaris/pengeluaran-material/page.tsx",
    "src/app/(dashboard)/inventaris/penyesuaian/page.tsx",
    "src/app/(dashboard)/pembelian/penerimaan/page.tsx",
    "src/app/(dashboard)/inventaris/mutasi-stok/page.tsx",
    "src/app/(dashboard)/inventaris/opname/sesi/page.tsx",
  ]

  for (const file of singleWarehousePages) {
    it(`${file} menapis daftar dengan cakupan gudang`, () => {
      const src = source(file)
      expect(src).toContain('from "@/lib/auth/warehouse-scope"')
      expect(src).toContain("getWarehouseScope")
      expect(src).toContain("warehouseId: { in: scope.warehouseIds }")
      expect(src).toContain('scope.kind === "none"')
    })
  }

  it("halaman transfer menapis asal ATAU tujuan, bukan warehouseId tunggal", () => {
    const src = source("src/app/(dashboard)/inventaris/transfer/page.tsx")
    expect(src).toContain('from "@/lib/auth/warehouse-scope"')
    expect(src).toContain("sourceWarehouseId: { in: scope.warehouseIds }")
    expect(src).toContain("destinationWarehouseId: { in: scope.warehouseIds }")
    expect(src).toContain('scope.kind === "none"')
    // AND, bukan OR kedua: where sudah memakai OR untuk pencarian.
    expect(src).toContain("AND: scopeClause")
  })
})
