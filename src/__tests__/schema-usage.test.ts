import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guard: setiap kolom skalar di `prisma/schema.prisma` harus benar-benar dipakai kode.
 *
 * Alasannya nyata: sesi ini menemukan `SalesInvoice.amountPaid` — kolom duplikat dari
 * `paidAmount` yang selalu 0 karena tak ada kode yang menulisnya. Kolom seperti itu
 * menyesatkan pembaca berikutnya (dua nama mirip, satu diam-diam kosong) dan tak
 * ketahuan oleh tsc, tes, maupun build. Lihat `docs/AUDIT-SCHEMA.md`.
 *
 * Dua keputusan penting soal cara memeriksa:
 *
 * 1. **SQL migrasi TIDAK dihitung sebagai pemakaian.** Kalau `.sql` ikut dipindai, setiap
 *    kolom akan "terpakai" hanya karena pernah muncul di `migration.sql` — persis yang
 *    membuat `amount_paid` tak pernah terdeteksi. Karena itu korpus = berkas kode saja.
 * 2. **Kolom FK dilewati.** Prisma memakai FK lewat `connect: { rel: ... }` tanpa pernah
 *    menyebut nama kolomnya (`requesterId`, `ticketId`, …), jadi menandainya sebagai
 *    "tak terpakai" adalah positif-palsu.
 *
 * `KNOWN_UNUSED` adalah daftar-beku: menambah kolom mati BARU akan memerahkan tes ini,
 * dan menambal kolom yang sudah ada di daftar juga memerahkan tes (dulu `updatedBy` —
 * kini sudah ditulis) — supaya daftarnya tidak membusuk.
 */
const KNOWN_UNUSED: string[] = [
  // Catatan: `*.updatedBy` dan kolom penaut rekonsiliasi yang duplikat TIDAK ada lagi di
  // daftar ini — keduanya sudah ditutup (updatedBy kini benar-benar ditulis; kolom
  // duplikat sudah dibuang). Ringkasan temuan yang sudah ditutup: docs/AUDIT-SCHEMA.md §0.
  //
  // Skalar tanpa rujukan — mayoritas adalah hook fitur yang halamannya SUDAH ada
  // (alur persetujuan, hari libur, lembur, pajak, permintaan pembelian), jadi keputusannya
  // per fitur: implementasikan atau buang. Lihat docs/AUDIT-SCHEMA.md §3.

  // Enam kolom berikut baru terdeteksi mati setelah 11 skrip yatim dibuang: selama ini
  // satu-satunya "pemakaian"-nya ada di skrip seed yang sudah rusak/tak terpakai, jadi
  // tidak ada kode aplikasi yang menulis atau membacanya. Keputusan per kolom:
  // implementasikan (impor rekening koran / rekonsiliasi bank, model aset per merek) atau
  // buang lewat migrasi.
  "ApprovalWorkflowStep.canSkip",
  "Asset.assetBrandModelId",
  "BankReconciliationItem.clearedDate",
  "BankStatement.totalCredits",
  "BankStatement.totalDebits",
  "BankStatementLine.matchedType",
].sort()

const ROOT = path.resolve(__dirname, "../..")
const SCALAR_TYPES = new Set([
  "String",
  "Int",
  "Boolean",
  "DateTime",
  "Decimal",
  "Float",
  "Json",
  "Bytes",
  "BigInt",
])

/** Berkas ini memuat nama semua kolom di `KNOWN_UNUSED`; kalau ikut dipindai, daftar-beku
 *  itu sendiri terbaca sebagai "pemakaian" dan tesnya jadi tidak bermakna. */
const SELF = "schema-usage.test.ts"

function readCode(relativeDir: string, out: string[]) {
  const dir = path.join(ROOT, relativeDir)
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    if (entry.name === SELF) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) readCode(path.relative(ROOT, full), out)
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(fs.readFileSync(full, "utf8"))
  }
}

/** Field skalar yang dilewati karena dipakai Prisma sebagai kolom FK. */
function foreignKeyScalars(schema: string): Set<string> {
  const fks = new Set<string>()
  for (const m of schema.matchAll(/@relation\([^)]*fields:\s*\[([^\]]*)\]/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim()
      if (name) fks.add(name)
    }
  }
  return fks
}

describe("skema: setiap kolom skalar dipakai kode", () => {
  it("tidak ada kolom mati di luar daftar-beku", () => {
    const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8")
    const code = (() => {
      const parts: string[] = []
      for (const dir of ["src", "scripts", "e2e", "prisma"]) readCode(dir, parts)
      return parts.join("\n")
    })()
    const fkScalars = foreignKeyScalars(schema)

    const unused: string[] = []
    for (const [, model, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      for (const line of body.split("\n")) {
        const field = /^\s{2}([a-z]\w*)\s+([A-Z]\w*)(\[\])?\??\s*(.*)$/.exec(line)
        if (!field) continue
        const [, name, type, array, rest] = field
        if (!SCALAR_TYPES.has(type) || array || rest.includes("@relation")) continue
        if (fkScalars.has(name)) continue
        const column = /@map\("([^"]+)"\)/.exec(rest)?.[1]
        const used = [name, column]
          .filter((value): value is string => Boolean(value))
          .some((value) => new RegExp(`\\b${value}\\b`).test(code))
        if (!used) unused.push(`${model}.${name}`)
      }
    }

    const baru = unused.sort().filter((entry) => !KNOWN_UNUSED.includes(entry))
    const basi = KNOWN_UNUSED.filter((entry) => !unused.includes(entry))

    expect({ kolomMatiBaru: baru, daftarBekuUsang: basi }).toEqual({
      kolomMatiBaru: [],
      daftarBekuUsang: [],
    })
  })
})

/** Model yang sama sekali tak dipakai kode. Diperiksa di tingkat MODEL karena
 *  pemeriksaan per-kolom bisa meleset: nama field sebuah model mati bisa muncul di
 *  kode lain (mis. `content`, `comment`), sehingga seluruh modelnya lolos. */
/**
 * Model yang benar-benar tak dipakai kode.
 *
 * KOSONG — dan itu hasil koreksi: dua model yang dulu terdaftar di sini
 * (`QcInspectionResult`, `ProductionGenealogyMaterial`) TIDAK mati. Keduanya dipakai
 * lewat **nama relasi** di dalam nested write/read Prisma
 * (`results: { … }`, `materials: { create: … }`), yang tidak pernah menyebut nama
 * modelnya. Pelajaran: "tak ada rujukan ke nama model" != "model mati" — pemeriksaan
 * harus ikut melihat nama relasi (lihat `dipakai()` di bawah).
 */
const KNOWN_UNUSED_MODELS: Array<{ model: string; reason: string }> = []

describe("skema: setiap model dipakai kode", () => {
  const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8")
  const code = (() => {
    const parts: string[] = []
    for (const dir of ["src", "scripts", "e2e", "prisma"]) readCode(dir, parts)
    return parts.join("\n")
  })()
  const namaModel = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1])
  // Nama relasi yang menunjuk ke model ini, mis. `results QcInspectionResult[]`.
  const namaRelasi = (model: string) =>
    [
      ...schema.matchAll(new RegExp(`^  +(\\w+)\\s+${model}\\[?\\]?\\??.*$`, "gm")),
    ]
      .map((m) => m[1])
      // Minimal 2 spasi indentasi + bukan kata kunci `model`: tanpa ini, baris header
      // `model X {` ikut tertangkap sebagai "relasi bernama model", dan karena `model:`
      // hampir pasti ada di suatu objek di kode, pemeriksaan ini SELALU menganggap
      // "dipakai" — penjaganya mati tanpa ketahuan (ditemukan lewat falsifikasi).
      .filter((nama) => nama !== "model")

  const dipakai = (model: string) => {
    const delegate = model[0].toLowerCase() + model.slice(1)
    if (new RegExp(`\\b${model}\\b`).test(code)) return true
    if (new RegExp(`\\b${delegate}\\b`).test(code)) return true
    // Nested write/read memakai NAMA RELASI, bukan nama model — inilah yang dulu
    // membuat `QcInspectionResult` & `ProductionGenealogyMaterial` keliru disebut mati.
    // Dibatasi ke posisi khas Prisma (`nama: {`, `nama: true`, `nama: [`) agar kata
    // umum seperti `results`/`materials` di variabel lokal tidak menjadi positif-palsu.
    return namaRelasi(model).some((rel) =>
      new RegExp(`\\b${rel}\\b\\s*:\\s*(\\{|true|false|\\[)`).test(code),
    )
  }
  const modelMati = namaModel.filter((model) => !dipakai(model)).sort()

  it("tidak ada model mati di luar daftar-beku", () => {
    expect(modelMati).toEqual(KNOWN_UNUSED_MODELS.map((x) => x.model).sort())
  })

  it("daftar model mati tidak membusuk (yang sudah dipakai harus dikeluarkan)", () => {
    const basi = KNOWN_UNUSED_MODELS.map((x) => x.model).filter((model) => dipakai(model))
    expect(basi, `model ini sudah dipakai — keluarkan dari daftar: ${basi.join(", ")}`).toEqual([])
  })
})
