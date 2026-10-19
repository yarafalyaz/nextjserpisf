import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

/**
 * Keseragaman kerangka halaman laporan.
 *
 * Setiap halaman DETAIL laporan wajib memakai `ReportPageShell`, sehingga
 * urutannya satu bentuk di seluruh aplikasi: remah → parameter laporan → aksi
 * (PDF/CSV/Cetak) → lembar laporan (kop, judul, periode, isi, kaki cetak).
 *
 * Sebelum penjaga ini ada, 23 halaman menyusun remah/filter/kopnya sendiri dan
 * tampil berbeda-beda ("kok beda beda gini ui ux laporannya"); halaman baru
 * bisa mengulang kesalahan yang sama tanpa ada satu pun tes yang gagal.
 *
 * Dua pengecualian yang memang bukan halaman detail:
 *   - `page.tsx` di akar `/laporan` — katalog pilihan modul.
 *   - `laporan/keuangan/page.tsx` — route lama yang me-redirect ke laporan kanonik.
 */

const reportsDir = path.resolve(__dirname, "../app/(dashboard)/laporan")

/** Pengecualian eksplisit — ditulis apa adanya supaya nama berkasnya jelas. */
const EXEMPT = ["keuangan/page.tsx", "page.tsx"]

function pageFiles(dir: string, rel = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const next = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) return pageFiles(path.join(dir, entry.name), next)
    return entry.name === "page.tsx" ? [next] : []
  })
}

const FILES = pageFiles(reportsDir)

/**
 * Berkas yang belum memakai shell, dengan nama berkas sebagai buktinya.
 * Halaman tipis boleh mendelegasikan shell ke komponen bersama di
 * `src/components/reports/` (mis. aging-report-view, income-statement-page);
 * render akhir tetap satu shell, jadi komponen itu ikut dipindai.
 */
const sharedComponentsDir = path.resolve(__dirname, "../components/reports")

function filesWithoutShell(): string[] {
  return FILES.filter((rel) => {
    const source = readFileSync(path.join(reportsDir, rel), "utf8")
    if (source.includes("<ReportPageShell")) return false
    // Delegasi: halaman mengimpor komponen bersama yang memakai shell.
    return ![...source.matchAll(/from\s+"@\/components\/reports\/([a-z0-9-]+)"/g)].some((m) => {
      try {
        return readFileSync(path.join(sharedComponentsDir, `${m[1]}.tsx`), "utf8").includes("<ReportPageShell")
      } catch {
        return false
      }
    })
  })
}

describe("keseragaman kerangka halaman laporan", () => {
  it("memindai seluruh halaman laporan, termasuk rute catch-all", () => {
    expect(FILES.length).toBeGreaterThan(30)
    // Kalau `[[...segments]]` terlewat, cakupan penjaga ini jadi bohong:
    // hampir semua laporan menaruh page.tsx di dalam segmen tersebut.
    expect(FILES.some((rel) => rel.includes("[[...segments]]"))).toBe(true)
  })

  it("hanya katalog dan redirect lama yang boleh tanpa shell", () => {
    expect(filesWithoutShell().sort()).toEqual([...EXEMPT].sort())
  })
})
