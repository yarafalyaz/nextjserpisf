import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Halaman dokumen yang dibatasi gudang WAJIB memeriksa batasnya, dengan tipe
 * yang benar.
 *
 * Delapan halaman (detail + ubah untuk empat dokumen) diedit hampir identik,
 * jadi risiko nyatanya adalah salah tempel tipe — mis. halaman Penerimaan Barang
 * memeriksa `material_issue`. Test ini mengunci pasangan halaman ↔ tipe dan
 * memastikan penjaganya tidak hilang saat berkas disunting lagi.
 */
const repoRoot = process.cwd()

const EXPECTED: Array<{ page: string; type: string }> = [
  { page: "inventaris/pengeluaran-material/[slug]/page.tsx", type: "material_issue" },
  { page: "inventaris/pengeluaran-material/[slug]/ubah/page.tsx", type: "material_issue" },
  { page: "pembelian/penerimaan/[slug]/page.tsx", type: "goods_receipt" },
  { page: "pembelian/penerimaan/[slug]/ubah/page.tsx", type: "goods_receipt" },
  { page: "inventaris/transfer/[slug]/page.tsx", type: "inventory_transfer" },
  { page: "inventaris/transfer/[slug]/ubah/page.tsx", type: "inventory_transfer" },
  { page: "inventaris/penyesuaian/[slug]/page.tsx", type: "stock_adjustment" },
  { page: "inventaris/penyesuaian/[slug]/ubah/page.tsx", type: "stock_adjustment" },
]

describe("batas gudang di halaman dokumen", () => {
  for (const { page, type } of EXPECTED) {
    it(`${page} memeriksa tipe "${type}"`, () => {
      const source = fs.readFileSync(path.join(repoRoot, "src/app/(dashboard)", page), "utf8")
      expect(source).toContain("canViewWarehouseScopedDocument")
      expect(source).toMatch(new RegExp(`canViewWarehouseScopedDocument\\(\\s*"${type}"`))
      // Halaman harus menolak dengan notFound() (bukan membocorkan keberadaan).
      expect(source).toContain("notFound()")
    })
  }
})
