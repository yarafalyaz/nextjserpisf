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
 * Guard: daftar opsi form tidak boleh menawarkan baris yang sudah dihapus
 * lunak. Halaman detail/ubah sudah dijaga `detail-page-tombstone`; kelas
 * cacat yang tersisa ada di daftar pilihan (`<select>`, `Combobox`,
 * `QuickAddSelect`) yang dirender form. Tanpa filter, tombstone tetap terlihat
 * sah dan action baru menolak sesudah form dikirim.
 *
 * `SalesInvoice` dan `PurchaseOrder` punya transisi terminal status-only,
 * bukan `deletedAt`; writerSoftModels tidak dapat melihatnya. Empat picker
 * retur karena itu juga dikunci ke gerbang status action. Halaman ubah boleh
 * menyertakan dokumen yang sedang tertaut agar Combobox tetap menampilkan label.
 *
 * Filter lifecycle yang diterima: `deletedAt: null` atau `isActive:`. Penulis
 * soft-delete model ber-`isActive` menulis keduanya, jadi bentuk-bentuk ini
 * setara untuk filter opsi. Pembacaan relasional seperti `where: { id: { in } }`
 * tetap dikecualikan: itu nama untuk dokumen lama, bukan opsi pilihan baru.
 */

const PAGES_DIR = path.join(ROOT, "src/app")
/** Model yang tombstone-nya membawa `isActive: false` bersama `deletedAt`. */
const LIFECYCLE_FILTER = /\b(?:deletedAt\s*:\s*null|isActive\s*:)/
const TERMINAL_MODELS = ["salesInvoice", "purchaseOrder"] as const
const TERMINAL_STATUS_FILTER = /\bstatus\s*:\s*\{\s*(?:in|not|notIn)\s*:/
const TERMINAL_PICKER_FILES = new Set([
  "src/app/(dashboard)/penjualan/retur/[slug]/ubah/page.tsx",
  "src/app/(dashboard)/penjualan/retur/tambah/[[...segments]]/page.tsx",
  "src/app/(dashboard)/pembelian/retur/[slug]/ubah/page.tsx",
  "src/app/(dashboard)/pembelian/retur/tambah/[[...segments]]/page.tsx",
])

interface Offence {
  file: string
  line: number
  model: string
}

function offences(): Offence[] {
  const tombstoned = writerSoftModels()
  const models = [...tombstoned].join("|")
  const tombstonePattern = models
    ? new RegExp(`prisma\\.(${models})\\.findMany\\(`, "g")
    : null
  const terminalPattern = new RegExp(
    `prisma\\.(${TERMINAL_MODELS.join("|")})\\.findMany\\(`,
    "g",
  )
  const bad: Offence[] = []

  for (const file of walk(PAGES_DIR, (n) => n.endsWith(".tsx") || n.endsWith(".ts"))) {
    const source = fs.readFileSync(file, "utf8")
    const rel = path.relative(ROOT, file)
    // Status-only model perlu diperiksa hanya pada empat picker retur yang
    // punya gerbang action terverifikasi; laporan dan lookup lain bukan opsi.
    const checkTerminal = TERMINAL_PICKER_FILES.has(rel)
    // Hanya halaman yang merender form: di situlah daftar opsi lahir.
    if (!/<[A-Z]\w*Form\b/.test(source)) continue

    const checks = [
      ...(tombstonePattern
        ? [...source.matchAll(tombstonePattern)].map((match) => ({ match, terminal: false }))
        : []),
      ...(checkTerminal
        ? [...source.matchAll(terminalPattern)].map((match) => ({ match, terminal: true }))
        : []),
    ]

    for (const { match, terminal } of checks) {
      const index = match.index ?? 0
      const open = index + match[0].length - 1
      const args = argumentObject(source, open)
      if (!args) continue
      const where = resolvedWhere(source, index, args)
      const model = match[1]

      if (terminal) {
        if (where === null || !TERMINAL_STATUS_FILTER.test(where)) {
          bad.push({ file: path.relative(ROOT, file), line: lineOf(source, index), model })
        }
        continue
      }

      if (where === null) {
        bad.push({ file: path.relative(ROOT, file), line: lineOf(source, index), model })
        continue
      }
      // Pembacaan relasional: baris dokumen yang sudah ada, bukan pilihan.
      if (/^\{\s*id\s*:\s*\{\s*in\s*:/.test(where.trim())) continue
      if (/^\{\s*slug\s*:\s*\{/.test(where.trim())) continue
      if (LIFECYCLE_FILTER.test(where)) continue
      bad.push({ file: path.relative(ROOT, file), line: lineOf(source, index), model })
    }
  }
  return bad
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length
}

describe("daftar opsi form menolak tombstone dan status terminal", () => {
  it("tidak ada opsi form yang membaca tombstone tanpa filter siklus hidup atau dokumen terminal tanpa filter status", () => {
    expect(offences()).toEqual([])
  })

  it("pengecualian status-terminal tidak membusuk", () => {
    const pages = new Set(
      walk(PAGES_DIR, (n) => n.endsWith(".tsx") || n.endsWith(".ts")).map((file) =>
        path.relative(ROOT, file),
      ),
    )
    expect([...TERMINAL_PICKER_FILES].filter((file) => !pages.has(file))).toEqual([])
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
