import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Setiap route di bawah `src/app/api/cron/` WAJIB memanggil `isValidCronRequest`.
 * Route cron tanpa guard = siapa pun bisa memicu depresiasi/jurnal/notifikasi/
 * penguncian periode dari internet. `proxy.ts` sengaja melewatkan `/api/cron`
 * (guard-nya ada di tiap route), sehingga route cron BARU yang lupa guard lolos
 * diam-diam — penjaga ini yang menangkapnya.
 *
 * Guard memakai fail-closed (`isValidCronRequest` menolak bila secret tak
 * di-set) + perbandingan constant-time, jadi syaratnya cukup: tiap `route.ts`
 * cron merujuk helper itu. Batasan tertulis: penjaga tidak membuktikan urutan
 * (cek SEBELUM logika) — itu dibaca manual saat review.
 */
const ROOT = process.cwd()
const CRON_DIR = path.join(ROOT, "src/app/api/cron")

function collectRouteFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectRouteFiles(full))
    else if (entry.name === "route.ts") out.push(full)
  }
  return out.sort()
}

describe("route cron dijaga CRON_SECRET", () => {
  it("ada cukup route cron untuk dipindai (pemindaian tak boleh hampa)", () => {
    const routes = collectRouteFiles(CRON_DIR)
    expect(routes.length).toBeGreaterThanOrEqual(5)
  })

  it("setiap route cron memanggil isValidCronRequest sebelum logika", () => {
    const routes = collectRouteFiles(CRON_DIR)
    const violations: string[] = []
    for (const file of routes) {
      // __tests__ tidak punya route.ts; direktori tes bernama __tests__ berisi
      // *.test.ts saja, jadi setiap route.ts di sini adalah handler produksi.
      const source = fs.readFileSync(file, "utf8")
      // Samakan lengkap dengan kurung buka: cek substring polos cocok juga
      // pada nama lain yang kebetulan berawalan sama.
      if (!source.includes("isValidCronRequest(")) {
        violations.push(path.relative(ROOT, file))
      }
    }
    expect(violations, "route cron tanpa guard CRON_SECRET").toEqual([])
  })
})
