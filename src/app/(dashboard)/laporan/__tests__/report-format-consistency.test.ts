import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import {
  formatDate,
  formatDayMonthYear,
  formatMonthYear,
  formatNumber,
  formatPeriod,
  formatShortRange,
  formatCurrency,
  formatQuantity,
  formatCompactNumber,
  formatPrintedAtWib,
} from "@/lib/utils/format"

/**
 * AC-REP-003 — ratchet format laporan (diperluas: halaman + renderer bersama).
 *
 * Semua label periode, nominal, dan hitungan di laporan WAJIB lewat
 * `src/lib/utils/format.ts`. Alasannya bukan kerapian kosmetik:
 *
 * - `formatDate` memaku `timeZone: "Asia/Jakarta"`. `toLocaleDateString("id-ID",
 *   …)` tanpa `timeZone` memakai zona runtime, sehingga label periode bergeser
 *   satu hari di browser non-WIB dan bisa berbeda antara render server dan
 *   hidrasi klien (kelas bug off-by-one-day yang diperingatkan `AGENTS.md`).
 * - `formatCurrency` menegaskan "Rp". Nominal mentah ("1.500.000") gampang
 *   dibaca sebagai jumlah unit, bukan rupiah.
 *
 * Cakupan: halaman `src/app/(dashboard)/laporan/**` (server component) +
 * renderer/tabel bersama yang mencetak laporan: `src/components/reports/**`
 * (kartu, kop, ekspor, grafik) + `src/lib/reports/**` (builder/loader murni)
 * + footer dokumen PDF (`src/lib/pdf/documents/statement.ts`).
 *
 * Tes ini statik (baca sumber) karena halaman laporan adalah server component
 * yang memanggil `requirePermission` + Prisma.
 */

/** Akar yang dipindai — halaman + renderer bersama. */
const REPORT_ROOTS = [
  path.join(process.cwd(), "src/app/(dashboard)/laporan"),
  path.join(process.cwd(), "src/components/reports"),
  path.join(process.cwd(), "src/lib/reports"),
  path.join(process.cwd(), "src/lib/pdf/documents/statement.ts"),
]

/**
 * Pengecualian sah: baris yang BOLEH memakai Intl mentah. Setiap entri
 * menyebut berkas + alasan; tes dua arah di bawah memastikan tidak ada
 * entri basi (berkas berubah/hilang) dan tidak ada Intl liar di luar daftar.
 */
const ALLOWLIST: Array<{ berkas: string; alasan: string }> = [
  {
    berkas: "src/lib/utils/format.ts",
    alasan: "satu-satunya rumah Intl — semua helper memaku locale/timeZone di sini",
  },
]

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

function berkasLaporan(akar: string, terkumpul: string[] = []): string[] {
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(akar)
  } catch {
    return terkumpul
  }
  if (!stat.isDirectory()) {
    if (SUMBER.test(akar) && !BUKAN_SUMBER.test(akar)) terkumpul.push(akar)
    return terkumpul
  }
  for (const nama of readdirSync(akar)) {
    const penuh = path.join(akar, nama)
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
  const berkas = REPORT_ROOTS.flatMap((akar) => berkasLaporan(akar))

  it("mengaudit halaman + renderer bersama (penjaga tidak boleh kosong)", () => {
    expect(berkas.length).toBeGreaterThan(60)
  })

  it("tidak ada tanggal/angka yang diformat ad-hoc di laporan + renderer bersama", () => {
    const pelanggaran: string[] = []
    const boleh = (relatif: string) =>
      ALLOWLIST.some(({ berkas }) => relatif === berkas || relatif.startsWith(`${berkas}/`))
    for (const penuh of berkas) {
      const relatif = path.relative(process.cwd(), penuh)
      if (boleh(relatif)) continue
      const baris = readFileSync(penuh, "utf8").split("\n")
      baris.forEach((isi, indeks) => {
        for (const { pola, sebab } of POLA_TERLARANG) {
          if (pola.test(isi)) pelanggaran.push(`${relatif}:${indeks + 1} — ${sebab}`)
        }
      })
    }
    expect(pelanggaran).toEqual([])
  })

  it("allowlist hanya berisi pengecualian yang masih hidup (tak ada entri basi)", () => {
    const masalah: string[] = []
    for (const { berkas, alasan } of ALLOWLIST) {
      const penuh = path.join(process.cwd(), berkas)
      let isi: string
      try {
        const stat = statSync(penuh)
        isi = stat.isDirectory() ? "__dir__" : readFileSync(penuh, "utf8")
      } catch {
        masalah.push(`${berkas} — hilang dari tree (${alasan})`)
        continue
      }
      if (isi === "__dir__") continue
      const masihMentah = POLA_TERLARANG.some(({ pola }) => pola.test(isi))
      if (!masihMentah) masalah.push(`${berkas} — tak ada Intl mentah lagi, cabut dari allowlist (${alasan})`)
    }
    expect(masalah).toEqual([])
  })

  it("label periode memakai teks Indonesia dan zona WIB, bukan zona runtime", () => {
    // 1 Oktober 2026 00:00 WIB tetap "1 Oktober 2026" walau runtime bukan WIB.
    const awalOktober = new Date("2026-09-30T17:00:00.000Z")
    expect(formatDate(awalOktober)).toBe("1 Oktober 2026")
    expect(formatDate(awalOktober, { format: "short" })).toBe("01 Okt 2026")
    expect(formatDayMonthYear(awalOktober)).toBe("1 Okt 2026")
    expect(formatMonthYear(awalOktober)).toBe("Oktober 2026")
    expect(formatShortRange(new Date("2026-09-30T17:00:00.000Z"), new Date("2026-10-30T17:00:00.000Z"))).toBe(
      "1 Okt - 31 Okt 2026",
    )
    expect(formatPeriod("2026-10")).toBe("Oktober 2026")
  })

  it("nominal laporan memakai simbol Rupiah dan hitungan tanpa simbol", () => {
    expect(formatCurrency(1500000)).toBe("Rp 1.500.000")
    expect(formatNumber(1500000)).toBe("1.500.000")
    expect(formatQuantity(1500)).toBe("1.500")
    expect(formatQuantity(2.5)).toBe("2,5")
    expect(formatCompactNumber(1500000).replace(" ", " ")).toBe("1,5 jt")
  })

  it("cap waktu cetak selalu Asia/Jakarta berlabel WIB, bukan zona perangkat", () => {
    // 2026-10-28T00:30:00Z = 07:30 WIB hari yang sama.
    expect(formatPrintedAtWib(new Date("2026-10-28T00:30:00.000Z"))).toBe("28 Oktober 2026 07.30 WIB")
    // Batas hari: 2026-10-27T18:00:00Z = 01:00 WIB tanggal 28.
    expect(formatPrintedAtWib(new Date("2026-10-27T18:00:00.000Z"))).toBe("28 Oktober 2026 01.00 WIB")
  })
})
