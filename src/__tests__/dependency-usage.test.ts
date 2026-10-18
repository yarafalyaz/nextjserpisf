import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guard: setiap dependensi runtime di `package.json` harus benar-benar dirujuk kode.
 *
 * Alasannya nyata: audit kode mati menemukan sembilan paket yang tidak punya satu pun
 * rujukan (`@dnd-kit/*`, `@tabler/icons-react`, `@tanstack/react-query`, `vaul`,
 * `zustand`, `@types/bcryptjs`). Paket seperti itu tidak ketahuan oleh tsc, eslint,
 * maupun build — `npm ci` tetap memasangnya, dan pembaca berikutnya mengira fitur
 * drag-and-drop/state-manager masih dipakai padahal tidak.
 *
 * Dua keputusan penting soal cara memeriksa:
 *
 * 1. **`devDependencies` tidak diperiksa.** Mayoritas adalah alat CLI yang hanya
 *    dipanggil dari `package.json` (`prisma`, `tsx`, `eslint`) atau dipakai implisit
 *    oleh tsc (`@types/*`), jadi memeriksanya menghasilkan derau tanpa manfaat.
 * 2. **Berkas ini dan `package.json` dikecualikan dari pemindaian.** Kalau ikut
 *    dipindai, daftar-beku di bawah terbaca sebagai "pemakaian" dan tesnya kehilangan
 *    makna.
 */

/** Dependensi runtime yang memang tidak pernah diimpor langsung. Bertambah hanya
 *  dengan alasan yang bisa diperiksa, bukan untuk membungkam temuan.
 *
 *  Saat ini kosong: `sharp` pernah di sini selagi hanya `next/image` yang
 *  memanggilnya, lalu dihapus begitu `scripts/generate-brand-icons.mjs`
 *  mengimpornya langsung — guard ini memang memeriksa daftar dari dua arah. */
const IMPLICIT_RUNTIME_DEPS: Array<{ name: string; reason: string }> = []

const ROOT = path.resolve(__dirname, "../..")
const SELF = "dependency-usage.test.ts"
const SCAN_DIRS = ["src", "scripts", "prisma", "e2e"]
const SCAN_EXT = /\.(ts|tsx|mjs|js|css)$/

function readTree(relativeDir: string, out: string[]) {
  const dir = path.join(ROOT, relativeDir)
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    if (entry.name === SELF) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) readTree(path.relative(ROOT, full), out)
    else if (SCAN_EXT.test(entry.name)) out.push(fs.readFileSync(full, "utf8"))
  }
}

/** Berkas konfigurasi di akar proyek — tempat `postcss`/`tw-animate-css` dirujuk. */
function readRootConfigs(out: string[]) {
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isFile() || !SCAN_EXT.test(entry.name)) continue
    if (entry.name === SELF) continue
    out.push(fs.readFileSync(path.join(ROOT, entry.name), "utf8"))
  }
}

function scannedText() {
  const chunks: string[] = []
  for (const dir of SCAN_DIRS) readTree(dir, chunks)
  readRootConfigs(chunks)
  return chunks.join("\n")
}

describe("dependensi runtime: setiap paket dipakai kode", () => {
  const dependencies = Object.keys(
    JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).dependencies ?? {},
  )

  it("tidak ada dependensi tanpa rujukan di luar daftar-beku", () => {
    const text = scannedText()
    const allowed = new Set(IMPLICIT_RUNTIME_DEPS.map((entry) => entry.name))
    const unreferenced = dependencies.filter((name) => !allowed.has(name) && !text.includes(name))

    expect(
      unreferenced,
      `Dependensi tanpa rujukan: ${unreferenced.join(", ")} — buang dari package.json (lalu jalankan npm install), atau tambahkan ke IMPLICIT_RUNTIME_DEPS dengan alasan bila memang dipakai implisit.`,
    ).toEqual([])
  })

  it("entri daftar-beku masih benar-benar tanpa rujukan", () => {
    const text = scannedText()
    const stale = IMPLICIT_RUNTIME_DEPS.filter((entry) => text.includes(entry.name)).map(
      (entry) => entry.name,
    )

    expect(
      stale,
      `Entri ini sudah dirujuk kode: ${stale.join(", ")} — hapus dari IMPLICIT_RUNTIME_DEPS karena daftarnya tidak boleh membusuk.`,
    ).toEqual([])
  })

  it("setiap entri daftar-beku punya alasan tertulis", () => {
    const tanpaAlasan = IMPLICIT_RUNTIME_DEPS.filter((entry) => entry.reason.trim().length < 20).map(
      (entry) => entry.name,
    )
    expect(tanpaAlasan).toEqual([])
  })
})
