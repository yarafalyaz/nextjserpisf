import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Daftar task cron hidup di TIGA tempat yang harus sama persis:
 * - `src/app/api/cron/route.ts` — eksekutor (`TASKS` + `runTask` switch)
 * - `src/actions/cron.actions.ts` — allowlist trigger manual (`ALLOWED_CRON_TASKS`)
 * - `src/app/(dashboard)/pengaturan/cron/page.tsx` — daftar UI (`CRON_TASKS`)
 *
 * Drift nyata yang ditangkap guard ini: `sweep-orphan-attachments` jalan di
 * eksekutor tapi tidak bisa dipicu manual (allowlist menolak), dan
 * `late-checkin`/`recover-stuck-reversals`/`sweep-orphan-attachments` tidak
 * tampil di UI sehingga status terakhirnya tak terlihat operator.
 */
const ROOT = process.cwd()

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8")
}

function extractConstStrings(source: string, constName: string): string[] {
  const match = new RegExp(`${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(source)
  if (!match) return []
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
}

function extractCronPageKeys(source: string): string[] {
  return [...source.matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1])
}

describe("daftar task cron sinkron UI ↔ action ↔ route", () => {
  it("pemindaian tidak hampa di ketiga sumber", () => {
    expect(extractConstStrings(read("src/app/api/cron/route.ts"), "TASKS").length).toBeGreaterThanOrEqual(5)
    expect(extractConstStrings(read("src/actions/cron.actions.ts"), "ALLOWED_CRON_TASKS").length).toBeGreaterThanOrEqual(5)
    expect(extractCronPageKeys(read("src/app/(dashboard)/pengaturan/cron/page.tsx")).length).toBeGreaterThanOrEqual(5)
  })

  it("key UI, allowlist manual, dan eksekutor sama persis", () => {
    const routeTasks = extractConstStrings(read("src/app/api/cron/route.ts"), "TASKS")
    const actionTasks = extractConstStrings(read("src/actions/cron.actions.ts"), "ALLOWED_CRON_TASKS")
    const pageKeys = extractCronPageKeys(read("src/app/(dashboard)/pengaturan/cron/page.tsx"))

    expect(new Set(actionTasks)).toEqual(new Set(routeTasks))
    expect(new Set(pageKeys)).toEqual(new Set(routeTasks))
  })

  it("setiap task route punya case di runTask", () => {
    const source = read("src/app/api/cron/route.ts")
    const routeTasks = extractConstStrings(source, "TASKS")
    const missing = routeTasks.filter((task) => !source.includes(`case "${task}":`))
    expect(missing).toEqual([])
  })
})
