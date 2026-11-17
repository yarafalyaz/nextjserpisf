import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

/**
 * Ratchet konvensi baris total (audit 2026-11-17).
 *
 * Renderer layar (`report-table-view.tsx`) dan PDF (`render.ts`) menyimpulkan
 * posisi angka dari `columns.length - cells.length`: label membentang kolom
 * kiri, angka menempati sel TRAILING. Satu placeholder `""` di depan membuat
 * `leadingCount` menyusut jadi 1, sehingga label menutupi kolom pertama dan
 * SEMUA nominal bergeser ke header yang salah — angka benar, kolom bohong.
 *
 * Regresi nyata yang ditutup guard ini: production-variance, project-pl-export,
 * depreciation-difference, scrap-material.
 *
 * Aturan: baris `kind: "total"` tidak boleh dimulai dengan sel kosong. Pengecualian
 * yang sah: baris total yang SELURUH selnya kosong (hanya label + hitungan di
 * label, mis. vendor-prices) — didaftarkan eksplisit di bawah, diperiksa dua arah.
 */

const REPORTS_DIR = path.join(process.cwd(), "src", "lib", "reports")

/** Berkas yang sengaja memakai total tanpa sel angka; entri basi = gagal. */
const ALLOWED_LABEL_ONLY: Record<string, string> = {
  "vendor-prices.ts":
    "Jumlah baris ditulis di label; tidak ada kolom angka, semua sel sah kosong.",
}

interface TotalRow {
  file: string
  line: number
  cells: string
}

function totalRowsInSource(file: string, source: string): TotalRow[] {
  const out: TotalRow[] = []
  const re = /kind:\s*"total"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    // jendela setelah penanda cukup untuk memuat objek baris total
    const seg = source.slice(m.index, m.index + 900)
    const cm = /cells:\s*\[([\s\S]*?)\]/.exec(seg)
    if (!cm) continue
    out.push({
      file,
      line: source.slice(0, m.index).split("\n").length,
      cells: cm[1],
    })
  }
  return out
}

describe("konvensi baris total laporan", () => {
  const files = readdirSync(REPORTS_DIR).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"),
  )

  it("memindai seluruh builder laporan (asersi non-vakum)", () => {
    expect(files.length).toBeGreaterThan(40)
  })

  it("tidak ada baris total yang diawali sel kosong (kolom akan bergeser)", () => {
    const offenders: string[] = []
    const seen = new Set<string>()
    for (const f of files) {
      const source = readFileSync(path.join(REPORTS_DIR, f), "utf8")
      for (const row of totalRowsInSource(f, source)) {
        const cells = row.cells
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c.length > 0)
        if (cells.length === 0) continue
        seen.add(row.file)
        const first = cells[0]
        const isEmptyFirst = first === '""' || first === "''" || first === "``"
        if (isEmptyFirst && !(row.file in ALLOWED_LABEL_ONLY)) {
          offenders.push(`${row.file}:${row.line} — sel pertama kosong, angka akan bergeser`)
        }
      }
    }
    expect(offenders).toEqual([])
    // Asersi non-vakum: benar-benar ada baris total terbaca.
    expect(seen.size).toBeGreaterThan(10)
  })

  it("daftar pengecualian tidak basi (diperiksa dua arah)", () => {
    const stale: string[] = []
    for (const file of Object.keys(ALLOWED_LABEL_ONLY)) {
      if (!files.includes(file)) {
        stale.push(`${file} — berkas tidak ada lagi`)
        continue
      }
      const source = readFileSync(path.join(REPORTS_DIR, file), "utf8")
      const rows = totalRowsInSource(file, source)
      // Entri hanya sah selama berkas itu memang punya total tanpa sel angka.
      // "label-only" = semua sel kosong: setelah membuang kutip/koma/spasi,
      // tidak ada token bernilai.
      const hasLabelOnly = rows.some(
        (r) => r.cells.replace(/["'\s,]/g, "") === "",
      )
      if (!hasLabelOnly) stale.push(`${file} — tidak lagi punya total label-only, cabut entrinya`)
    }
    expect(stale).toEqual([])
  })
})
