import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Putaran 104: picker akun yang bermuara ke jurnal wajib definisi kanonis
 * (aktif, belum dihapus, **daun**).
 *
 * `journal.service` (`:106-125`) dan `assertAccountsExist`
 * (`accounting.hook.ts:75-98`) menolak akun induk saat posting. Picker yang
 * hanya menyaring `isActive: true` tetap menjanjikan dropdown berisi akun induk
 * — di DB dev 18 dari 128 akun adalah induk ("1101 Kas & Bank", "1200 Aset
 * Tetap"), jadi operator bisa memilih akun yang pasti ditolak saat menyimpan
 * jurnal. Guard ini mengunci: setiap picker akun di halaman formulir keuangan,
 * aset, PPh dan transaksi berulang memakai `loadPostableAccounts` (atau query
 * dengan `children: { none: {} }`).
 */

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

const D = "src/app/(dashboard)"

/** Halaman formulir yang menawarkan akun untuk diposting. */
const ACCOUNT_PICKER_PAGES = [
  `${D}/keuangan/jurnal/tambah/page.tsx`,
  `${D}/keuangan/jurnal/[slug]/ubah/page.tsx`,
  `${D}/keuangan/pengeluaran/tambah/page.tsx`,
  `${D}/keuangan/pengeluaran/[slug]/ubah/page.tsx`,
  `${D}/keuangan/kas-kecil/tambah/[[...segments]]/page.tsx`,
  `${D}/keuangan/kas-kecil/[slug]/ubah/page.tsx`,
  `${D}/keuangan/transfer-bank/tambah/page.tsx`,
  `${D}/keuangan/penyetoran-pajak/tambah/page.tsx`,
  `${D}/keuangan/rekonsiliasi-bank/tambah/page.tsx`,
  `${D}/keuangan/laporan-bank/tambah/page.tsx`,
  `${D}/keuangan/giro/page.tsx`,
  `${D}/keuangan/dokumen-pajak/bupot/tambah/page.tsx`,
  `${D}/pengaturan/pajak-potong/tambah/page.tsx`,
  `${D}/pengaturan/pajak-potong/[slug]/ubah/page.tsx`,
  `${D}/pengaturan/transaksi-berulang/tambah/page.tsx`,
  `${D}/pengaturan/transaksi-berulang/[slug]/ubah/page.tsx`,
  `${D}/aset/kategori/tambah/page.tsx`,
  `${D}/aset/kategori/[slug]/ubah/page.tsx`,
  `${D}/pembelian/uang-muka/tambah/page.tsx`,
  `${D}/sdm/penggajian/komponen/page.tsx`,
  `${D}/sdm/disiplin/keputusan/page.tsx`,
]

describe("guard picker akun yang bisa diposting (putaran 104)", () => {
  for (const file of ACCOUNT_PICKER_PAGES) {
    it(`${file} hanya menawarkan akun yang bisa diposting`, () => {
      const src = source(file)
      const usesCanonicalLoader = src.includes("loadPostableAccounts")
      const filtersLeaf =
        /children:\s*\{\s*none:\s*\{\s*\}\s*\}/.test(src) || /_count\.children\s*===\s*0/.test(src)

      expect(
        usesCanonicalLoader || filtersLeaf,
        `${file}: picker akun harus memakai loadPostableAccounts atau menapis children: { none: {} } — akun induk ditolak journal.service`,
      ).toBe(true)
    })
  }
})
