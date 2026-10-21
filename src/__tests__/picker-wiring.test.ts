import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga pemakaian pemilih tanggal/bulan/jam di formulir & filter.
 *
 * Standar proyek adalah `AppDatePicker` / `AppMonthPicker` / `AppTimePicker`
 * (komponen di `src/components/ui/`), bukan `<input type="date|month|time">`
 * bawaan browser — tampilannya tidak konsisten dan tidak berbahasa
 * Indonesia. Beberapa formulir sempat lolos memakai input native; tes ini
 * mencegahnya kambuh.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const DATE_CASES: Array<{ area: string; file: string; names: string[] }> = [
  {
    area: "absensi: formulir catat/ubah",
    file: "src/app/(dashboard)/sdm/absensi/_components/attendance-forms.tsx",
    names: ["date"],
  },
  {
    area: "absensi: filter daftar",
    file: "src/app/(dashboard)/sdm/absensi/_components/attendance-filter-form.tsx",
    names: ["tanggal"],
  },
  {
    area: "aturan statutori: berlaku sejak/sampai & tutup aturan",
    file: "src/app/(dashboard)/sdm/aturan-statutori/_components/statutory-rule-forms.tsx",
    names: ["effectiveFrom", "effectiveTo"],
  },
  {
    area: "kalender kerja: hari libur & hari libur departemen",
    file: "src/app/(dashboard)/sdm/kalender-kerja/_components/work-calendar-forms.tsx",
    names: ["date"],
  },
  {
    area: "opname: sesi baru",
    file: "src/app/(dashboard)/inventaris/opname/sesi/_components/stocktake-forms.tsx",
    names: ["date"],
  },
  {
    area: "rekening koran: baris mutasi",
    file: "src/app/(dashboard)/keuangan/laporan-bank/[slug]/_components/bank-statement-line-form.tsx",
    names: ["date"],
  },
]

const MONTH_CASES: Array<{ area: string; file: string }> = [
  { area: "absensi: filter bulan", file: "src/app/(dashboard)/sdm/absensi/_components/attendance-filter-form.tsx" },
  { area: "penyetoran pajak: masa pajak", file: "src/app/(dashboard)/keuangan/penyetoran-pajak/_components/tax-payment-form.tsx" },
  { area: "proses akhir bulan: bulan yang ditutup", file: "src/app/(dashboard)/pengaturan/proses-akhir-bulan/_components/period-close-panel.tsx" },
  { area: "penggajian: periode gaji massal", file: "src/app/(dashboard)/sdm/penggajian/_components/bulk-generate-payroll-button.tsx" },
  { area: "laporan: filter periode mode bulan", file: "src/components/reports/report-period-filter.tsx" },
]

const TIME_CASES: Array<{ area: string; file: string }> = [
  { area: "absensi: jam masuk/keluar", file: "src/app/(dashboard)/sdm/absensi/_components/attendance-forms.tsx" },
  { area: "kalender kerja: jam jadwal", file: "src/app/(dashboard)/sdm/kalender-kerja/_components/work-calendar-forms.tsx" },
]

describe("datepicker: formulir memakai AppDatePicker, bukan input tanggal native", () => {
  for (const { area, file, names } of DATE_CASES) {
    it(area, () => {
      const src = read(file)
      expect(src).toContain('from "@/components/ui/date-picker"')
      for (const name of names) {
        expect(src).toContain(`name="${name}"`)
      }
      expect(src).not.toContain('type="date"')
    })
  }
})

describe("monthpicker: formulir memakai AppMonthPicker, bukan input bulan native", () => {
  it("komponen AppMonthPicker tersedia senada AppDatePicker", () => {
    const src = read("src/components/ui/month-picker.tsx")
    expect(src).toContain("export function AppMonthPicker")
    expect(src).toContain('type="hidden"')
  })

  for (const { area, file } of MONTH_CASES) {
    it(area, () => {
      const src = read(file)
      expect(src).toContain('from "@/components/ui/month-picker"')
      expect(src).toContain("AppMonthPicker")
      expect(src).not.toContain('type="month"')
    })
  }
})

describe("timepicker: formulir memakai AppTimePicker, bukan input jam native", () => {
  it("menit bisa dipilih per 1 menit (bukan kelipatan 5)", () => {
    const src = read("src/components/ui/time-picker.tsx")
    expect(src).toContain("minuteStep = 1,")
    expect(src).not.toContain("minuteStep = 5,")
  })

  for (const { area, file } of TIME_CASES) {
    it(area, () => {
      const src = read(file)
      expect(src).toContain('from "@/components/ui/time-picker"')
      expect(src).toContain("AppTimePicker")
      expect(src).not.toContain('type="time"')
    })
  }
})
