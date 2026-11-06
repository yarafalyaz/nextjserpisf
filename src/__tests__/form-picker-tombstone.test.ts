import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  ROOT,
  argumentObject,
  resolvedWhere,
  walk,
  writerSoftModels,
} from "./support/tombstone-models"

/**
 * Guard: daftar opsi pada form tidak boleh menawarkan baris yang sudah dihapus
 * lunak.
 *
 * Halaman detail/ubah sudah dijaga `detail-page-tombstone`; kelas cacat yang
 * tersisa ada di **daftar pilihan** (`<select>`, `Combobox`, `QuickAddSelect`)
 * yang dirender form. Baris tombstone masih ada di tabel, jadi tanpa filter ia
 * tetap muncul sebagai pilihan yang tampak sah — dan aksinya baru menolaknya
 * SETELAH pengguna mengisi seluruh form: `updateInventoryTransfer` dan
 * `updateStockAdjustment` memanggil `assertWarehousesExistAndActive`, sehingga
 * menyimpan gagal dengan "Gudang #<id> tidak ditemukan" pada data yang barusan
 * ditawarkan UI sendiri. Itu kegagalan yang tidak bisa dipulihkan pengguna —
 * pilihan yang salah tidak kelihatan salah.
 *
 * Aturannya: setiap `findMany` atas model ber-tombstone yang sumbernya sebuah
 * halaman ber-`<...Form>` wajib menyaring siklus hidup di `where`-nya —
 * `deletedAt: null`, atau `isActive` apa pun. `isActive` diterima karena setiap
 * penulis soft-delete untuk model ber-`isActive` (warehouse, item, employee,
 * tax, customer, vendor, customerCategory, approvalWorkflow,
 * recurringTransaction) menulis `isActive: false` bersama `deletedAt`, jadi
 * operator itu praktis identik — dan itulah bentuk yang sudah dipakai
 * mayoritas halaman (`where: { isActive: true }`).
 *
 * Yang sengaja di luar aturan:
 *
 *   - **Pembacaan relasional** (`where: { id: { in: ids } }`). Baris itu dibaca
 *     untuk menampilkan nama pada dokumen yang sudah ada; menyaringnya
 *     menyembunyikan riwayat yang sah, dan dokumen lamanya memang boleh
 *     menunjuk baris yang belakangan dihapus.
 *   - **`getFieldName`-style helper** di `src/lib` — bukan daftar pilihan.
 */

const PAGES_DIR = path.join(ROOT, "src/app")
/** Model yang tombstone-nya membawa `isActive: false` bersama `deletedAt`. */
const LIFECYCLE_FILTER = /\b(?:deletedAt\s*:\s*null|isActive\s*:)/

interface Offence {
  file: string
  line: number
  model: string
}

function offences(): Offence[] {
  const tombstoned = writerSoftModels()
  const models = [...tombstoned].join("|")
  if (!models) return []
  const pattern = new RegExp(`prisma\\.(${models})\\.findMany\\(`, "g")
  const bad: Offence[] = []

  for (const file of walk(PAGES_DIR, (n) => n.endsWith(".tsx") || n.endsWith(".ts"))) {
    const source = fs.readFileSync(file, "utf8")
    // Hanya halaman yang merender form: di situlah daftar opsi lahir.
    if (!/<[A-Z]\w*Form\b/.test(source)) continue

    for (const match of source.matchAll(pattern)) {
      const open = (match.index ?? 0) + match[0].length - 1
      const args = argumentObject(source, open)
      if (!args) continue
      const where = resolvedWhere(source, match.index ?? 0, args)
      if (where === null) {
        // Tanpa `where` sama sekali = seluruh tabel, termasuk tombstone.
        bad.push({ file: path.relative(ROOT, file), line: lineOf(source, match.index ?? 0), model: match[1] })
        continue
      }
      // Pembacaan relasional: baris dokumen yang sudah ada, bukan pilihan.
      if (/^\{\s*id\s*:\s*\{\s*in\s*:/.test(where.trim())) continue
      if (LIFECYCLE_FILTER.test(where)) continue
      bad.push({ file: path.relative(ROOT, file), line: lineOf(source, match.index ?? 0), model: match[1] })
    }
  }
  return bad
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length
}

describe("daftar opsi form menolak baris tombstone", () => {
  it("tidak ada opsi form yang membaca model ber-tombstone tanpa filter siklus hidup", () => {
    expect(offences()).toEqual([])
  })

  it("kontrol positif: pemindaian benar-benar menemukan halaman ber-form dan opsi terfilter", () => {
    // Menjaga penjaga: kalau penanda `<...Form>` berubah sehingga tak ada
    // berkas yang diperiksa, tes di atas hijau tanpa memeriksa apa pun.
    const formPages = walk(PAGES_DIR, (n) => n.endsWith(".tsx")).filter((file) =>
      /<[A-Z]\w*Form\b/.test(fs.readFileSync(file, "utf8")),
    )
    expect(formPages.length).toBeGreaterThanOrEqual(50)

    const filters = formPages.filter((file) =>
      /prisma\.(warehouse|item|employee|customer|vendor)\.findMany\(\{[\s\S]{0,200}?isActive: true/.test(
        fs.readFileSync(file, "utf8"),
      ),
    )
    expect(filters.length).toBeGreaterThanOrEqual(5)
  })
})
