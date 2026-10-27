import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

/**
 * Konvensi URL laporan: periode dan filter ada di PATH, bukan query string.
 *
 * Penjaga ini memindai setiap halaman laporan. Kalau sebuah halaman membaca
 * parameter periode/entitas dari query tapi TIDAK lewat helper bersama
 * (`reportPeriodFromRoute` / `splitReportSegments`), berarti ada laporan yang
 * kembali ke bentuk lama — persis yang lolos di empat halaman (multi-periode,
 * serapan-overhead, valuasi-stok, proyeksi-kas) sebelum penjaga ini ada, karena
 * audit manual sebelumnya hanya mencari nama param `tanggalMulai`.
 *
 * Helper bersama itu juga yang memegang aturan "tautan lama tetap dibaca",
 * jadi memakainya wajib, bukan sekadar rapi.
 *
 * B1 (TASK-020): penjaga lama buta terhadap 15 laporan posisi/aset karena
 * regex-nya hanya membaca tipe literal `searchParams: Promise<{...}>`.
 * Halaman bertipe `Record<...>` dan halaman tanpa `searchParams` sama
 * sekali (memakai `parseReportPeriod` langsung) lolos tanpa terdeteksi.
 * Deteksi sekarang membaca tiga bentuk sumber: kunci pada tipe literal,
 * akses properti pada variabel hasil resolve `searchParams`, dan
 * pemanggilan `parseReportPeriod` langsung tanpa helper.
 */

const reportsDir = path.resolve(__dirname, "../app/(dashboard)/laporan")

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return pageFiles(full)
    return entry.name === "page.tsx" ? [full] : []
  })
}

/** Parameter yang menandakan periode atau identitas entitas. */
function isPeriodOrEntityKey(key: string): boolean {
  if (/tanggal|periode|date|akhir|bulan|jenis/i.test(key)) return true
  return /Id$/.test(key) || key === "id"
}

/** Nama variabel lokal yang memegang hasil resolve `searchParams`. */
function searchVariableNames(source: string): string[] {
  const names = new Set<string>(["search", "searchParams"])
  // const search = await searchParams
  for (const match of source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+searchParams/g)) {
    names.add(match[1])
  }
  // const [params, search] = await Promise.all([routeParams, searchParams])
  for (const match of source.matchAll(/const\s*\[([^\]]*)\]\s*=\s*await\s+Promise\.all\(\s*\[([^\]]*)\]/g)) {
    const destructured = match[1].split(",").map((part) => part.trim().split(/[:=]/)[0]?.trim())
    const args = match[2].split(",").map((part) => part.trim())
    args.forEach((arg, index) => {
      if (arg === "searchParams" && destructured[index]) names.add(destructured[index])
    })
  }
  return [...names]
}

/** Kunci query yang dibaca halaman, dari tipe literal maupun akses properti. */
function flaggedQueryKeys(source: string): string[] {
  const keys = new Set<string>()
  // Bentuk lama yang sudah tertangkap: tipe literal inline.
  const typeMatch = source.match(/searchParams:\s*Promise<\{([^}]*)\}>/)
  if (typeMatch) {
    for (const entry of typeMatch[1].matchAll(/([a-zA-Z]+)\??:/g)) keys.add(entry[1])
  }
  // Tipe Record<...> tidak memuat kunci; bacaan nyatanya lewat akses
  // properti pada variabel hasil resolve searchParams.
  for (const name of searchVariableNames(source)) {
    const access = new RegExp(`\\b${name}\\s*(?:\\.\\s*([A-Za-z]+)|\\[\\s*["']([^"']+)["']\\s*\\])`, "g")
    for (const match of source.matchAll(access)) {
      const key = match[1] ?? match[2]
      if (key) keys.add(key)
    }
  }
  // Destrukturisasi langsung: const { tanggalMulai } = await searchParams
  for (const match of source.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s+searchParams/g)) {
    for (const entry of match[1].matchAll(/([a-zA-Z]+)/g)) keys.add(entry[1])
  }
  return [...keys].filter(isPeriodOrEntityKey)
}

/** Halaman melanggar konvensi bila membaca periode di luar helper bersama. */
function isOffender(source: string): boolean {
  if (/reportPeriodFromRoute|splitReportSegments/.test(source)) return false
  // parseReportPeriod langsung tidak sadar tautan lama ?tanggalMulai=&
  // tanggalSelesai= — halaman tanpa searchParams pun tertangkap di sini.
  if (/parseReportPeriod\(/.test(source)) return true
  return flaggedQueryKeys(source).length > 0
}

describe("konvensi URL laporan", () => {
  const files = pageFiles(reportsDir)

  it("menemukan halaman laporan (penjaga tes itu sendiri)", () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it("halaman yang membaca parameter periode/entitas memakai helper path bersama", () => {
    const offenders = files
      .filter((file) => isOffender(readFileSync(file, "utf8")))
      .map((file) => file.slice(reportsDir.length + 1))

    expect(offenders).toEqual([])
  })
})

describe("deteksi pola lama (B1)", () => {
  it("menangkap tipe Record<...> yang membaca tanggal dari query tanpa helper", () => {
    const legacy = `
      export default async function Page({ params: routeParams, searchParams }: {
        params: Promise<{ segments?: string[] }>
        searchParams: Promise<Record<string, string | undefined>>
      }) {
        const [params, search] = await Promise.all([routeParams, searchParams])
        const period = parseReportPeriod(params.segments?.[0] ?? search.tanggalMulai, { start: now, end: now })
      }`
    expect(isOffender(legacy)).toBe(true)
    expect(flaggedQueryKeys(legacy)).toContain("tanggalMulai")
  })

  it("menangkap halaman tanpa searchParams yang memakai parseReportPeriod langsung", () => {
    const legacy = `
      export default async function Page({ params: routeParams }: {
        params: Promise<{ segments?: string[] }>
      }) {
        const params = await routeParams
        const period = parseReportPeriod(params.segments?.[0], {
          start: new Date(now.getFullYear(), 0, 1),
          end: now,
        })
      }`
    expect(isOffender(legacy)).toBe(true)
  })

  it("menangkap tipe literal lama tanpa helper", () => {
    const legacy = `
      export default async function Page({ searchParams }: {
        searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
      }) {
        const search = await searchParams
        const start = search.tanggalMulai
      }`
    expect(isOffender(legacy)).toBe(true)
  })

  it("tidak menandai halaman termigrasi yang memakai helper bersama", () => {
    const migrated = `
      export default async function Page({ params: routeParams, searchParams }: {
        params: Promise<{ segments?: string[] }>
        searchParams: Promise<Record<string, string | undefined>>
      }) {
        const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
          start: new Date(now.getFullYear(), 0, 1),
          end: now,
        }))
      }`
    expect(isOffender(migrated)).toBe(false)
  })
})
