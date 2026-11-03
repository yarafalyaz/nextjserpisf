import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Guard: penguraian `workDays` hanya boleh lewat `src/lib/utils/work-days.ts`.
 *
 * Kelas cacat yang dijaga (putaran 116): `Number("")` bernilai 0, dan 0 adalah
 * hari MINGGU yang sah. Setiap pembaca yang menulis
 * `workDays.split(",").map((d) => Number(d.trim()))` tanpa membuang token kosong
 * mengubah jadwal kosong menjadi "hanya Minggu", dan fallback Senin–Jumat tak
 * pernah hidup. Cacatnya tidak terlihat di layar: yang salah adalah ANGKA —
 * slip gaji massal menghitung 5 hari kerja alih-alih 21, potongan absen hari
 * biasa hilang, dan notifikasi absen tidak pernah muncul untuk hari kerja.
 *
 * Kontraknya sengaja sempit: rantai yang menyebut `workDays`, dipecah dengan
 * `split(",")`, lalu mengubah tokennya dengan `Number(` TANPA melewati util
 * bersama, dianggap pelanggaran. Membaca `workDays` untuk hal lain (mis.
 * mencentang checkbox di form) tidak tersentuh.
 */
const ROOT = process.cwd()
const SRC = path.join(ROOT, "src")
const SHARED_PARSER = path.join("src", "lib", "utils", "work-days.ts")

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue
      collectFiles(full, out)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** Rantai penguraian manual: `workDays` … `split(",")` … `Number(`. */
function parsesWorkDaysByHand(source: string): boolean {
  // Komentar dibuang dulu: dokumentasi yang MENGUTIP pola lama (mis.
  // `normalizeWorkDays`) bukan pelanggaran — yang diperiksa kode.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
  const chainRe = /workDays[\s\S]{0,160}?\.split\(\s*","\s*\)[\s\S]{0,160}?Number\(/g
  return chainRe.test(code)
}

describe("workDays diurai satu jalur", () => {
  it("parser bersama hanya didefinisikan di src/lib/utils/work-days.ts", () => {
    const offenders: string[] = []
    for (const file of collectFiles(SRC)) {
      const rel = path.relative(ROOT, file)
      if (rel === SHARED_PARSER) continue
      const source = fs.readFileSync(file, "utf8")
      if (/export\s+function\s+parseWorkDays\b/.test(source)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it("tidak ada kode produksi yang mengurai workDays dengan Number() manual", () => {
    const offenders: string[] = []
    for (const file of collectFiles(SRC)) {
      const rel = path.relative(ROOT, file)
      if (rel === SHARED_PARSER) continue // util itu sendiri yang sah
      const source = fs.readFileSync(file, "utf8")
      if (parsesWorkDaysByHand(source)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it("pola lama terdeteksi (guard tidak lolos kosong)", () => {
    expect(
      parsesWorkDaysByHand(
        `const days = (schedule?.workDays ?? "").split(",").map((d) => Number(d.trim()))`,
      ),
    ).toBe(true)
    expect(parsesWorkDaysByHand(`const weekdays = new Set(parseWorkDays(schedule?.workDays))`)).toBe(
      false,
    )
    // Form hanya membaca isi jadwal untuk mencentang checkbox — bukan cacat.
    expect(
      parsesWorkDaysByHand(
        `(schedule?.workDays ?? "1,2,3,4,5").split(",").map((v) => v.trim())`,
      ),
    ).toBe(false)
  })
})
