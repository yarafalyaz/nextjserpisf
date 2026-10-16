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

/** Kunci query pada tipe `searchParams` halaman. */
function flaggedQueryKeys(source: string): string[] {
  const match = source.match(/searchParams: Promise<\{([^}]*)\}>/)
  if (!match) return []
  return [...match[1].matchAll(/([a-zA-Z]+)\??:/g)]
    .map((entry) => entry[1])
    .filter(isPeriodOrEntityKey)
}

describe("konvensi URL laporan", () => {
  const files = pageFiles(reportsDir)

  it("menemukan halaman laporan (penjaga tes itu sendiri)", () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it("halaman yang membaca parameter periode/entitas memakai helper path bersama", () => {
    const offenders = files
      .filter((file) => {
        const source = readFileSync(file, "utf8")
        if (flaggedQueryKeys(source).length === 0) return false
        return !/reportPeriodFromRoute|splitReportSegments/.test(source)
      })
      .map((file) => file.slice(reportsDir.length + 1))

    expect(offenders).toEqual([])
  })
})
