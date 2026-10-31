import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga tanggal StockMove: kartu stok dan laporan mutasi stok menyaring
 * `stock_moves.transaction_date` per periode. Kolom itu nullable tanpa
 * default, dan pernah TIDAK diisi satu pun dari 11 creator move (semua
 * hanya mengandalkan created_at) — kedua laporan mengembalikan nol baris
 * untuk seluruh dokumen nyata.
 *
 * Aturan: setiap `stockMove.create` di kode produksi WAJIB memuat field
 * `date:` (tanggal dokumen sumber) di objek datanya. Creator baru yang
 * lupa akan memerahkan tes ini.
 */

const ROOT = join(__dirname, "..", "..")

function productionFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue
      out.push(...productionFiles(p))
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
      out.push(p)
    }
  }
  return out
}

describe("StockMove.date wajib diisi setiap creator", () => {
  it("semua stockMove.create produksi memuat date tanggal dokumen", () => {
    const offenders: string[] = []
    for (const file of productionFiles(join(ROOT, "src"))) {
      const src = readFileSync(file, "utf8")
      // Tiap kemunculan create: jendela 400 char sesudahnya harus memuat
      // `date:` sebelum kurung data tertutup kasar (heuristik ratchet —
      // objek data create di repo selalu ringkas di awal blok).
      for (const m of src.matchAll(/stockMove\.create\(/g)) {
        // Create atas objek rakitan (`create({ data: m ... })`) dinilai oleh
        // aturan moveInserts di bawah, bukan jendela literal ini.
        if (/stockMove\.create\(\{\s*data:\s*m\b/.test(src.slice(m.index, m.index + 60))) continue
        const window = src.slice(m.index, m.index + 400)
        if (!/\bdate:/.test(window)) {
          offenders.push(`${file.replace(ROOT + "/", "")}@${m.index}`)
        }
      }
      // Pola map atas baris jadi (posting-service reversal): create menerima
      // objek rakitan `m`, tanggalnya wajib ada di definisi barisnya.
      if (/stockMove\.create\(\{\s*data:\s*m\b/.test(src) && !/\bdate:\s*reversalDate/.test(src)) {
        offenders.push(`${file.replace(ROOT + "/", "")}:moveInserts-tanpa-date`)
      }
    }
    expect(offenders, `creator tanpa date: ${offenders.join(", ")}`).toEqual([])
  })
})
