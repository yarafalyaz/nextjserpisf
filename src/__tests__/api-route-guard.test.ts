import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Penjaga guard route API.
 *
 * Setiap `src/app/api/** /route.ts` wajib masuk tepat satu kelas penjagaan:
 * memeriksa izin (`hasPermission`/`require*`), memeriksa rahasia cron
 * (`isValidCronRequest`), menegakkan otorisasi per-sumber-daya di dalam
 * handler (terdaftar di `INTERNAL` beserta simbol penegaknya), atau memang
 * publik by design (terdaftar di `PUBLIC`). Route baru yang belum
 * terklasifikasi memerahkan test ini — tidak bisa lagi terkirim hanya
 * bermodal sesi login tanpa ada yang menyadari.
 *
 * Diperiksa DUA ARAH (pola ratchet repo ini): entri `INTERNAL`/`PUBLIC`
 * yang route-nya sudah memeriksa izin sendiri / sudah hilang = gagal,
 * supaya peta wajib dirapikan saat handler berubah.
 */

const ROOT = join(__dirname, "..", "..")
const API = join(ROOT, "src/app/api")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const PERMISSION_CALL =
  /hasPermission\(|requirePermission\(|requireAnyPermission\(|requireRole\(|requireAuth\(/
const CRON_CALL = /isValidCronRequest\(/
const SESSION_CALL = /auth\(\)/

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (entry === "route.ts") out.push(relative(API, full))
  }
  return out
}

/**
 * Route yang otorisasinya ditegakkan per sumber daya di dalam handler,
 * bukan lewat satu izin global. Nilainya adalah simbol penegak yang wajib
 * masih ada di file — mencabutnya memerahkan test ini.
 */
const INTERNAL: Record<string, RegExp> = {
  "attachments/[...path]/route.ts": /canAccessAttachment/,
  "workflow/[...path]/route.ts": /APPROVAL_REFERENCE_PERMISSIONS/,
  "notifications/route.ts": /where:\s*\{\s*userId/,
  "notifications/[id]/read/route.ts": /markAsRead\(notificationId, userId\)/,
  "upload/attachments/route.ts": /canModifyAttachment/,
  "upload/attachments/[id]/route.ts": /canModifyAttachment/,
  "upload/avatar/route.ts": /where:\s*\{\s*id: userId \}/,
}

/** Route publik by design: handler NextAuth, health check, data referensi alamat. */
const PUBLIC = ["auth/[...nextauth]/route.ts", "health/route.ts", "address/route.ts"]

describe("route API: terklasifikasi penjagaannya", () => {
  const routes = routeFiles(API)
  const srcOf = (r: string) => read(join("src/app/api", r))
  const classified = (r: string) => {
    const src = srcOf(r)
    if (PERMISSION_CALL.test(src)) return "permission"
    if (CRON_CALL.test(src)) return "cron"
    if (r in INTERNAL) return "internal"
    if (PUBLIC.includes(r)) return "public"
    return "none"
  }

  it("setiap route API punya kelas penjagaan", () => {
    const unclassified = routes.filter((r) => classified(r) === "none")
    expect(
      unclassified,
      `Route API tanpa izin/cron/penegak internal dan tidak terdaftar publik:\n${unclassified.join("\n")}`,
    ).toEqual([])
  })

  it("peta pengecualian tidak menyimpan entri usang", () => {
    const exceptions = [...Object.keys(INTERNAL), ...PUBLIC]
    const stale = exceptions.filter((r) => {
      if (!routes.includes(r)) return true
      const src = srcOf(r)
      return PERMISSION_CALL.test(src) || CRON_CALL.test(src)
    })
    expect(
      stale,
      `Entri pengecualian yang route-nya sudah menjaga sendiri/sudah hilang:\n${stale.join("\n")}`,
    ).toEqual([])
  })

  it("route internal benar-benar menegakkan otorisasi per sumber daya", () => {
    for (const [route, enforcer] of Object.entries(INTERNAL)) {
      const src = srcOf(route)
      expect(SESSION_CALL.test(src), `${route} harus memeriksa sesi`).toBe(true)
      expect(enforcer.test(src), `${route} harus memakai penegak ${enforcer}`).toBe(true)
    }
  })

  it("route publik tidak menyentuh data tenant", () => {
    for (const route of PUBLIC) {
      const src = srcOf(route)
      expect(src, `${route} publik tetapi membaca Prisma`).not.toMatch(/prisma\.\w+\.find/)
    }
  })
})
