import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { formatDate, formatNumber, formatPeriod, formatCurrency } from "@/lib/utils/format"

/**
 * AC-REP-003 — ratchet format laporan.
 *
 * Semua label periode, nominal, dan hitungan di halaman laporan WAJIB lewat
 * `src/lib/utils/format.ts`. Alasannya bukan kerapian kosmetik:
 *
 * - `formatDate` memaku `timeZone: "Asia/Jakarta"`. `toLocaleDateString("id-ID",
 *   …)` tanpa `timeZone` memakai zona runtime, sehingga label periode bergeser
 *   satu hari di browser non-WIB dan bisa berbeda antara render server dan
 *   hidrasi klien (kelas bug off-by-one-day yang diperingatkan `AGENTS.md`).
 * - `formatCurrency` menegaskan "Rp". Nominal mentah ("1.500.000") gampang
 *   dibaca sebagai jumlah unit, bukan rupiah.
 *
 * Tes ini statik (baca sumber) karena halaman laporan adalah server component
 * yang memanggil `requirePermission` + Prisma.
 */

const REPORT_ROOT = path.join(process.cwd(), "src/app/(dashboard)/laporan")
const SUMBER = /\.(ts|tsx)$/
const BUKAN_SUMBER = /(__tests__|\.test\.(ts|tsx)$|\.spec\.(ts|tsx)$)/

/** Format lokal yang dilarang: harus lewat helper bersama. */
const POLA_TERLARANG: Array<{ pola: RegExp; sebab: string }> = [
  {
    pola: /\.toLocaleDateString\(/,
    sebab: "tanggal ad-hoc — pakai formatDate()/formatPeriod() (memaku Asia/Jakarta)",
  },
  {
    pola: /\.toLocaleString\(["']id-ID["']/,
    sebab: "angka ad-hoc — pakai formatCurrency()/formatNumber()",
  },
  {
    pola: /new Intl\.(DateTimeFormat|NumberFormat)\(/,
    sebab: "Intl langsung — pakai helper di src/lib/utils/format.ts",
  },
]

function berkasLaporan(dir: string, terkumpul: string[] = []): string[] {
  for (const nama of readdirSync(dir)) {
    const penuh = path.join(dir, nama)
    if (statSync(penuh).isDirectory()) {
      if (nama === "__tests__") continue
      berkasLaporan(penuh, terkumpul)
      continue
    }
    if (SUMBER.test(nama) && !BUKAN_SUMBER.test(penuh)) terkumpul.push(penuh)
  }
  return terkumpul
}

describe("AC-REP-003 — format laporan seragam lewat format.ts", () => {
  const berkas = berkasLaporan(REPORT_ROOT)

  it("mengaudit seluruh berkas halaman laporan (penjaga tidak boleh kosong)", () => {
    expect(berkas.length).toBeGreaterThan(20)
  })

  it("tidak ada tanggal/angka yang diformat ad-hoc di halaman laporan", () => {
    const pelanggaran: string[] = []
    for (const penuh of berkas) {
      const relatif = path.relative(process.cwd(), penuh)
      const baris = readFileSync(penuh, "utf8").split("\n")
      baris.forEach((isi, indeks) => {
        for (const { pola, sebab } of POLA_TERLARANG) {
          if (pola.test(isi)) pelanggaran.push(`${relatif}:${indeks + 1} — ${sebab}`)
        }
      })
    }
    expect(pelanggaran).toEqual([])
  })

  it("label periode memakai teks Indonesia dan zona WIB, bukan zona runtime", () => {
    // 1 Oktober 2026 00:00 WIB tetap "1 Oktober 2026" walau runtime bukan WIB.
    const awalOktober = new Date("2026-09-30T17:00:00.000Z")
    expect(formatDate(awalOktober)).toBe("1 Oktober 2026")
    expect(formatDate(awalOktober, { format: "short" })).toBe("01 Okt 2026")
    expect(formatPeriod("2026-10")).toBe("Oktober 2026")
  })

  it("nominal laporan memakai simbol Rupiah dan hitungan tanpa simbol", () => {
    expect(formatCurrency(1500000)).toBe("Rp 1.500.000")
    expect(formatNumber(1500000)).toBe("1.500.000")
  })
})
