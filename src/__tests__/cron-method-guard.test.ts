import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Setiap route di bawah `src/app/api/cron/` DILARANG mengekspor handler GET.
 * Trigger cron bermutasi (jurnal, notifikasi, penguncian periode, sinkronisasi
 * libur), sedangkan semantik HTTP menuntut GET aman/idempoten — pemicu GET
 * bisa terpanggil tak sengaja oleh prefetcher, crawler, atau monitor yang
 * melakukan GET. Karena itu cron hanya boleh dipicu lewat POST (auth Bearer
 * `isValidCronRequest` tetap wajib, lihat `cron-route-guard.test.ts`).
 *
 * Penjaga ini menangkap regresi: route cron BARU yang mengekspor GET, atau
 * rute lama yang dikembalikan ke GET, gagal di sini sebelum sempat terpicu
 * mutasi dari jalur yang salah.
 */
const ROOT = process.cwd()
const CRON_DIR = path.join(ROOT, "src/app/api/cron")

// Dua pola ekspor handler Next.js: `export [async] function GET(...)` dan
// `export const GET = ...`.
const GET_EXPORT_PATTERN =
  /export\s+(?:async\s+)?function\s+GET\b|export\s+const\s+GET\b/

function collectRouteFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectRouteFiles(full))
    else if (entry.name === "route.ts") out.push(full)
  }
  return out.sort()
}

describe("route cron POST saja (tanpa handler GET)", () => {
  it("ada cukup route cron untuk dipindai (pemindaian tak boleh hampa)", () => {
    const routes = collectRouteFiles(CRON_DIR)
    expect(routes.length).toBeGreaterThanOrEqual(5)
  })

  it("tidak ada route cron yang mengekspor handler GET", () => {
    const routes = collectRouteFiles(CRON_DIR)
    const violations: string[] = []
    for (const file of routes) {
      // __tests__ tidak punya route.ts; direktori tes bernama __tests__ berisi
      // *.test.ts saja, jadi setiap route.ts di sini adalah handler produksi.
      const source = fs.readFileSync(file, "utf8")
      if (GET_EXPORT_PATTERN.test(source)) {
        violations.push(path.relative(ROOT, file))
      }
    }
    expect(violations, "route cron mengekspor GET (cron wajib POST saja)").toEqual([])
  })
})
