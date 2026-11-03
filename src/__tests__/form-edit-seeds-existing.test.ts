import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Field yang dikelola form harus di-seed dari rekaman saat mengedit.
 *
 * Pola bug berulang di repo ini: kontrol tanpa nilai awal → halaman Ubah tampil
 * kosong → menyimpan menulis nilai kosong dan menghapus data yang sudah ada.
 * Dua kasus yang terbukti: catatan transfer aset dan kode baris rak.
 */
const repoRoot = process.cwd()

function read(rel: string) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8")
}

describe("form edit men-seed field yang sudah ada", () => {
  it("textarea catatan transfer aset memakai defaultValue dari record", () => {
    const source = read("src/components/forms/asset-transfer-form.tsx")
    expect(source).toMatch(/name="notes"[\s\S]{0,400}?defaultValue=\{transfer\?\.notes \?\? ""\}/)
  })

  it("input kode baris rak memakai defaultValue dari record saat mode manual", () => {
    const source = read("src/components/forms/rack-row-form.tsx")
    expect(source).toMatch(/name="code"[\s\S]{0,400}?defaultValue=\{enableAutoCode \? undefined : rackRow\?\.code \?\? ""\}/)
  })

  it("payload item faktur mengirim balik uom/serial/deskripsi yang dimuat dari record", () => {
    // Putaran 110: updateSalesInvoice menghapus SELURUH baris lalu menulis
    // ulang dari payload form. Field baris yang tidak ikut dikirim hilang
    // diam-diam setiap kali faktur disunting (UoM, nomor seri, deskripsi).
    const source = read("src/components/forms/sales-invoice-form.tsx")
    expect(source).toMatch(/\.map\(\(row\) => \(\{\s*itemId: row\.itemId,[\s\S]{0,400}?row\.uom \? \{ uom: row\.uom \}/)
    expect(source).toMatch(/serialNumbers: row\.serialNumbers \}/)
    expect(source).toMatch(/description: row\.description \}/)
  })
})
