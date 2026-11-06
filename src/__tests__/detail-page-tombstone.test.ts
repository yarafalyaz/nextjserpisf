import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guard: halaman detail/ubah tidak boleh membuka baris yang sudah dihapus lunak.
 *
 * `resolveEntity` (src/lib/utils/resolve-entity.ts) menerima segmen URL berupa
 * slug ATAU id numerik — bentuk id itulah yang membuat tautan lama dan bookmark
 * tetap hidup setelah migrasi slug. Masalahnya: baris yang dihapus lunak masih
 * ada di tabel, jadi tanpa filter `deletedAt: null` URL lama tetap merender
 * data yang "sudah tidak ada" — lengkap dengan tombol Ubah/Hapus yang
 * menawarkan mengedit mayat. Halaman daftar sudah lama menyaringnya; halaman
 * detail tidak, dan tidak ada tsc/lint/tes biasa yang menangkapnya karena
 * query-nya sah secara tipe.
 *
 * Daftar model TIDAK ditulis tangan. Penjaga ini menurunkannya dari dua sumber
 * yang harus tetap sepakat:
 *
 *   1. `prisma/schema.prisma` — model yang punya kolom `deletedAt` (kandidat).
 *   2. `src/actions`/`src/lib` — model yang benar-benar ditulisi
 *      `deletedAt: <bukan null>` sebagai kunci tingkat-atas di dalam `data:`
 *      sebuah `update`/`updateMany`.
 *
 * Yang dipakai adalah irisan. Memakai (1) saja terlalu luas: 42 model berkolom
 * `deletedAt`, tetapi kebanyakan delete-nya keras (guard status/FK), sehingga
 * filternya tak pernah menyala dan penjaga hanya menuntut diff kosong. Memakai
 * (2) saja akan meloloskan penulis yang lupa menambah kolom. Irisan membuat
 * penjaga ikut menyala begitu penulis soft-delete baru muncul — itulah
 * ratchet-nya, tanpa daftar pengecualian yang harus dirawat.
 *
 * Pengecualian yang disengaja: `bulk.actions.ts` memakai dispatch dinamis
 * (`prisma[modelName].updateMany`), jadi bentuk itu tak terpindai. Himpunan
 * yang HANYA bisa dihapus lunak lewat hapus massal karena itu tak terdeteksi —
 * dan saat ini kosong: keempat model yang terjangkau hapus massal (customer,
 * item, vendor, warehouse) juga punya penulis `deletedAt` eksplisit di
 * `master.actions.ts`, jadi semuanya tetap diperiksa.
 *
 * Pemindai (skema→penulis, `topLevelValues`, `argumentObject`) tinggal di
 * `./support/tombstone-models` karena penjaga `form-picker-tombstone` memakai
 * irisan yang sama; dua salinan akan menyimpang diam-diam.
 */
import {
  ROOT,
  argumentObject,
  matchingParen,
  schemaSoftModels,
  topLevelValues,
  walk,
  writerSoftModels,
} from "./support/tombstone-models"

const PAGES_DIR = path.join(ROOT, "src/app/(dashboard)")

/** Setiap pemanggilan `await resolveEntity(...)` di sebuah berkas. */
function resolveBlocks(source: string): string[] {
  const out: string[] = []
  const needle = "await resolveEntity("
  let from = 0
  for (;;) {
    const start = source.indexOf(needle, from)
    if (start === -1) return out
    const open = source.indexOf("(", start)
    const close = matchingParen(source, open)
    if (close === -1) return out
    out.push(source.slice(start, close + 1))
    from = close + 1
  }
}

interface Offence {
  file: string
  models: string[]
  reason: string
}

function offences(tombstoned: Set<string>): Offence[] {
  const bad: Offence[] = []
  for (const file of walk(PAGES_DIR, (n) => n.endsWith(".tsx"))) {
    const source = fs.readFileSync(file, "utf8")
    if (!source.includes("resolveEntity(")) continue
    for (const block of resolveBlocks(source)) {
      const models = [
        ...new Set(
          [...block.matchAll(/prisma\.(\w+)\.(?:findFirst|findUnique)\(/g)].map((m) => m[1]),
        ),
      ].filter((model) => tombstoned.has(model))
      if (models.length === 0) continue

      // Bentuk A: filter lewat `fallbackWhere` + tiap lookup menyebarkan `...where`.
      const viaFallback =
        /fallbackWhere:\s*\{[^}]*deletedAt:\s*null/.test(block) && block.includes("...where")
      // Bentuk B: filter ditulis langsung di `where` tiap lookup model tersebut.
      const viaInline = models.every((model) =>
        [...block.matchAll(new RegExp(`prisma\\.${model}\\.(?:findFirst|findUnique)\\(`, "g"))].every(
          (m) => {
            const lookup = argumentObject(block, (m.index ?? 0) + m[0].length - 1)
            if (!lookup) return false
            const where = topLevelValues(lookup).get("where")
            return !!where && /\bdeletedAt:\s*null/.test(where)
          },
        ),
      )
      if (!viaFallback && !viaInline) {
        bad.push({ file: path.relative(ROOT, file), models, reason: "tidak menyaring deletedAt" })
      }
    }
  }
  return bad
}

/**
 * Halaman yang TIDAK memakai `resolveEntity` — hanya segmen URL mentah yang
 * dibaca langsung dari `await params`. Aturannya sama: kalau `where` sebuah
 * lookup menyebut nilai segmen itu, model yang dihapus lunak wajib menyaring.
 *
 * Dibatasi pada nama variabel segmen (bukan "semua lookup di halaman
 * ber-parameter"): pembacaan relasional seperti `where: { id: rule.itemId }`
 * atau `where: { userId }` mengambil baris lain, bukan entitas halaman ini —
 * menyaring tombstone di sana menyembunyikan riwayat yang sah.
 */
function segmentOffences(tombstoned: Set<string>): Offence[] {
  const bad: Offence[] = []
  for (const file of walk(PAGES_DIR, (n) => n.endsWith(".tsx"))) {
    const dir = path.dirname(file)
    if (!/\[\[?\.{0,3}\w+\]\]?/.test(dir)) continue
    const source = fs.readFileSync(file, "utf8")
    // Berkas ber-`resolveEntity` sudah dinilai tes sebelumnya (termasuk
    // bentuk `fallbackWhere`), jadi aturan ini fokus pada halaman yang
    // mengerjakan slug/id sendiri dan lolos dari pemindaian itu.
    if (source.includes("resolveEntity(")) continue
    const segments = new Set<string>()
    for (const match of source.matchAll(
      /const\s*\{([^}]*)\}\s*=\s*await\s+(?:params|routeParams)\b/g,
    )) {
      for (const part of match[1].split(",")) {
        // `alias: namaAsli` — yang dipakai di body adalah nama kiri.
        const name = part.split(":").pop()?.trim() ?? ""
        if (/^[A-Za-z_$][\w$]*$/.test(name)) segments.add(name)
      }
    }
    if (segments.size === 0) continue

    for (const match of source.matchAll(/prisma\.(\w+)\.(?:findFirst|findUnique)\(/g)) {
      const model = match[1]
      if (!tombstoned.has(model)) continue
      const argObject = argumentObject(source, (match.index ?? 0) + match[0].length - 1)
      if (!argObject) continue
      const where = topLevelValues(argObject).get("where")
      if (!where) continue
      const keyedBySegment = [...segments].some((name) =>
        new RegExp(`[^\\w$.]${name.replace(/\$/g, "\\$")}[^\\w$]`).test(where),
      )
      if (!keyedBySegment) continue
      if (/\bdeletedAt:\s*null/.test(where)) continue
      bad.push({
        file: path.relative(ROOT, file),
        models: [model],
        reason: "lookup bersegmen tanpa deletedAt: null",
      })
    }
  }
  return bad
}

describe("tombstone di halaman detail/ubah", () => {
  it("tidak ada resolveEntity atas model yang bisa dihapus lunak tanpa filter tombstone", () => {
    expect(offences(writerSoftModels())).toEqual([])
  })

  it("tidak ada lookup bersegmen URL tanpa filter tombstone", () => {
    expect(segmentOffences(writerSoftModels())).toEqual([])
  })

  it("kontrol positif: pemindaian memang menemukan penulis dan blok yang diperiksa", () => {
    // Menjaga penjaga: kalau penanda berubah sehingga salah satu sisi
    // pemindaian kosong, tes di atas akan hijau tanpa memeriksa apa pun.
    expect([...writerSoftModels()].sort()).toEqual(
      expect.arrayContaining([
        "customer",
        "employee",
        "item",
        "lead",
        "pettyCash",
        "tax",
        "training",
        "vendor",
        "warehouse",
      ]),
    )

    const tombstoned = writerSoftModels()
    const inspected = walk(PAGES_DIR, (n) => n.endsWith(".tsx"))
      .map((file) => fs.readFileSync(file, "utf8"))
      .flatMap(resolveBlocks)
      .filter((block) =>
        [...block.matchAll(/prisma\.(\w+)\.(?:findFirst|findUnique)\(/g)].some((m) =>
          tombstoned.has(m[1]),
        ),
      )
    expect(inspected.length).toBeGreaterThanOrEqual(15)
  })

  it("setiap model penulis tombstone memang punya kolom deletedAt di skema", () => {
    const schemaModels = schemaSoftModels()
    for (const model of writerSoftModels()) {
      expect(schemaModels.has(model), `${model} ditulisi deletedAt tapi tak punya kolomnya`).toBe(true)
    }
  })

  it("model yang dihapus keras tidak ikut dituntut filter tombstone", () => {
    // Ratchet dua arah untuk kasus nyata: `salesInvoice` punya kolom
    // `deletedAt` dan blok update-nya memuat `select: { deletedAt: true }`
    // di include bersarang, tetapi tak ada penulis tombstone — pemindaian
    // naif menuduh halaman faktur tanpa sebab. Kunci di sini menjaga
    // pemindaian tetap tingkat-atas.
    const tombstoned = writerSoftModels()
    expect(schemaSoftModels().has("salesInvoice")).toBe(true)
    expect(tombstoned.has("salesInvoice")).toBe(false)
    expect(tombstoned.has("quotation")).toBe(false)
  })
})
