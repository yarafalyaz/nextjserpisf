import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga URL filter berbentuk path (pasangan kunci/nilai), bukan query.
 *
 * Filter tanggal/bulan dan pola edit inline (`?edit<X>=`) pernah menyebar
 * sebagai query string yang bisa bertabrakan dan tidak konsisten dengan
 * konvensi laporan. Modul-modul ini sudah dipindah ke segmen path
 * (`[[...segments]]` + `parsePathFilterSegments`) dengan redirect untuk
 * tautan query lama; tes ini mencegah pola query-nya kambuh.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const PATH_FILTER_PAGES: Array<{ area: string; file: string; keys: string[] }> = [
  {
    area: "kalender: bulan di path",
    file: "src/app/(dashboard)/kalender/[[...segments]]/page.tsx",
    keys: ["bulan"],
  },
  {
    area: "penggajian: tahun/bulan di path",
    file: "src/app/(dashboard)/sdm/penggajian/[[...segments]]/page.tsx",
    keys: ["tahun", "bulan"],
  },
  {
    area: "proses akhir bulan: periode di path",
    file: "src/app/(dashboard)/pengaturan/proses-akhir-bulan/[[...segments]]/page.tsx",
    keys: ["periode"],
  },
  {
    area: "perintah pembayaran: sampai di path",
    file: "src/app/(dashboard)/pembelian/perintah-pembayaran/[[...segments]]/page.tsx",
    keys: ["sampai"],
  },
  {
    area: "log aktivitas: dari/sampai di path",
    file: "src/app/(dashboard)/pengaturan/log-aktivitas/[[...segments]]/page.tsx",
    keys: ["dari", "sampai"],
  },
]

describe("url filter path: halaman membaca filter dari segmen, bukan query", () => {
  for (const { area, file, keys } of PATH_FILTER_PAGES) {
    it(area, () => {
      const src = read(file)
      expect(src).toContain("parsePathFilterSegments")
      expect(src).toContain("redirect(")
      for (const key of keys) {
        expect(src).toContain(key)
      }
    })
  }

  it("halaman detail laporan bank tidak lagi membangun tautan ?editBaris=", () => {
    const src = read("src/app/(dashboard)/keuangan/laporan-bank/[slug]/page.tsx")
    expect(src).not.toContain("?editBaris=${")
    expect(src).toContain("/baris/${line.id}/ubah")
    expect(src).toContain("/baris/tambah")
  })

  it("halaman ubah baris membatasi baris pada rekening koran yang sama", () => {
    const create = read("src/app/(dashboard)/keuangan/laporan-bank/[slug]/baris/tambah/page.tsx")
    expect(create).toContain('requirePermission("create_journals")')
    expect(create).toContain("<BankStatementLineForm")
    const edit = read("src/app/(dashboard)/keuangan/laporan-bank/[slug]/baris/[lineId]/ubah/page.tsx")
    expect(edit).toContain('requirePermission("create_journals")')
    expect(edit).toContain("stmt.lines.find")
    expect(edit).toContain("notFound()")
  })
})
