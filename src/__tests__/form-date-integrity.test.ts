import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Form dokumen bertanggal tidak boleh mengirim "hari ini" secara hardcode.
 *
 * Kelas bug ini sudah terbukti tiga kali (transfer stok, penyesuaian stok,
 * perintah kerja): form memakai tanggal berjalan saat submit, sehingga membuka
 * dokumen back-date lalu menyimpannya kembali memindahkan dokumen — beserta
 * angka laporannya — ke periode berjalan. Tanggal dokumen harus berasal dari
 * `defaultValues`/prop saat mengedit, bukan dari `new Date()` di jalur submit.
 *
 * Test ini memindai pola hardcode yang persis, jadi menghidupkannya kembali akan
 * langsung memerahkan test.
 */
const HARDCODED_DATE_PATTERNS = [
  /append\(\s*["']date["']\s*,\s*toLocalDateOnly\(new Date\(\)\)\s*\)/,
  /append\(\s*["']date["']\s*,\s*new Date\(\)\.toISOString\(\)/,
]

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry.name)) acc.push(full)
  }
  return acc
}

describe("integritas tanggal dokumen di form", () => {
  const repoRoot = process.cwd()
  const formFiles = walk(path.join(repoRoot, "src/components/forms"))

  it("tidak ada form yang mengirim tanggal 'hari ini' secara hardcode", () => {
    const offenders: string[] = []
    for (const file of formFiles) {
      const source = fs.readFileSync(file, "utf8")
      for (const pattern of HARDCODED_DATE_PATTERNS) {
        if (pattern.test(source)) {
          offenders.push(`${path.relative(repoRoot, file)} (${pattern.source})`)
        }
      }
    }
    expect(offenders, `form berikut mengirim tanggal hardcode:\n${offenders.join("\n")}`).toEqual([])
  })
})
