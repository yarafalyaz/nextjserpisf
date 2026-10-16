import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guard: kode produksi tidak boleh punya `catch` yang benar-benar kosong.
 *
 * Repo ini sudah pernah membersihkan "kegagalan senyap yang menyesatkan" — sebuah
 * `catch {}` membuat operasi tampak berhasil padahal gagal, dan tidak tertangkap tsc,
 * lint, maupun tes (tidak ada yang melempar). Kalau error memang sengaja diabaikan,
 * tulis alasannya di dalam blok itu supaya pembaca berikutnya tahu itu disengaja.
 *
 * Berkas tes tidak diperiksa: menelan error di sana memang sering tujuannya
 * (mis. `.catch(() => false)` pada pemeriksaan visibilitas).
 */
const ROOT = path.resolve(__dirname, "../..")
const DIRS = ["src", "scripts"]
// .mjs/.js ikut dipindai: `scripts/` berisi 6 skrip .mjs, dan kegagalan senyap
// di sana sama-sama tak tertangkap tsc (yang hanya memeriksa .ts/.tsx).
const EXT = /\.(ts|tsx|mjs|js)$/
const EMPTY_CATCH = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g

/**
 * Satu-satunya pengecualian: skrip bootstrap tema yang disuntik inline di `<head>`.
 * Ia harus tidak pernah melempar (localStorage bisa tidak tersedia), dan di sana tidak
 * ada yang bisa dilakukan — jadi blok kosongnya memang keputusan, bukan kelalaian.
 */
const ALLOWED: Record<string, string> = {
  "src/app/layout.tsx": "skrip bootstrap tema inline di <head>",
}

/**
 * Analog promise-level dari catch kosong: `.catch(() => {})`, `() => undefined`,
 * `() => null`. Ini juga kegagalan senyap — operasi tampak selesai padahal gagal —
 * dan sama-sama tak tertangkap tsc/lint/tes. Yang MENYESATKAN PENGGUNA sudah
 * diperbaiki (address-picker, notifikasi, daftar merek/model: kini menampilkan pesan);
 * yang tersisa di daftar ini memang pembersihan best-effort atau setelan opsional.
 *
 * Catatan jujur soal kelebaran: daftar ini mengecualikan per BERKAS, jadi penyisipan
 * `.catch(() => {})` baru di dalam berkas-berkas itu tidak akan tertangkap. Cukup untuk
 * berkas ini karena semua penelannya sejenis, tapi bukan penjagaan yang ketat.
 */
const SILENT_PROMISE_CATCH = /\.catch\(\s*\(\s*\)\s*=>\s*(\{\s*\}|undefined|null)\s*\)/g

const ALLOWED_PROMISE_CATCH: Record<string, string> = {
  "src/app/api/upload/attachments/route.ts": "hapus berkas sementara — gagal pun tak berdampak",
  "src/components/forms/vendor-payment-form.tsx": "hapus lampiran best-effort setelah simpan",
  "src/components/reports/report-letterhead.tsx": "setelan opsional; null berarti pakai default",
  "src/lib/db/backup.ts": "pembersihan berkas / cloud best-effort",
}

function productionFiles(dir: string, out: string[] = []): string[] {
  const full = path.join(ROOT, dir)
  if (!fs.existsSync(full)) return out
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    if (entry.name === "__tests__" || /\.test\.tsx?$/.test(entry.name)) continue
    const child = path.join(full, entry.name)
    if (entry.isDirectory()) productionFiles(path.relative(ROOT, child), out)
    else if (EXT.test(entry.name)) out.push(child)
  }
  return out
}

describe("kegagalan senyap: tidak ada catch kosong di kode produksi", () => {
  it("setiap catch punya isi, atau berkasnya terdaftar sebagai pengecualian beralasan", () => {
    const pelanggar: string[] = []

    for (const dir of DIRS) {
      for (const file of productionFiles(dir)) {
        const relative = path.relative(ROOT, file)
        if (ALLOWED[relative]) continue
        const source = fs.readFileSync(file, "utf8")
        for (const match of source.matchAll(EMPTY_CATCH)) {
          pelanggar.push(`${relative}:${source.slice(0, match.index).split("\n").length}`)
        }
      }
    }

    expect({ catchKosong: pelanggar.sort() }).toEqual({ catchKosong: [] })
  })

  it("pengecualian menunjuk berkas yang benar-benar ada (daftar tidak membusuk)", () => {
    const hilang = Object.keys(ALLOWED).filter((f) => !fs.existsSync(path.join(ROOT, f)))
    expect({ pengecualianHilang: hilang }).toEqual({ pengecualianHilang: [] })
  })
})

  it("tidak ada `.catch()` senyap di luar daftar pengecualian", () => {
    const pelanggar: string[] = []

    for (const dir of DIRS) {
      for (const file of productionFiles(dir)) {
        const relative = path.relative(ROOT, file)
        if (ALLOWED_PROMISE_CATCH[relative]) continue
        const source = fs.readFileSync(file, "utf8")
        for (const match of source.matchAll(SILENT_PROMISE_CATCH)) {
          pelanggar.push(`${relative}:${source.slice(0, match.index).split("\n").length}`)
        }
      }
    }

    expect({ catchPromiseSenyap: pelanggar.sort() }).toEqual({ catchPromiseSenyap: [] })
  })

  it("daftar pengecualian promise tidak membusuk", () => {
    const tidakTerpakai = Object.keys(ALLOWED_PROMISE_CATCH).filter((relative) => {
      const full = path.join(ROOT, relative)
      if (!fs.existsSync(full)) return true
      // Salinan tanpa flag `g`: regex ber-`g` bersifat stateful pada `.test()`
      // (lastIndex berpindah antar-panggilan), yang membuat pemeriksaan ini bohong.
      const pola = new RegExp(SILENT_PROMISE_CATCH.source)
      return !pola.test(fs.readFileSync(full, "utf8"))
    })
    expect({ pengecualianTakTerpakai: tidakTerpakai }).toEqual({ pengecualianTakTerpakai: [] })
  })

