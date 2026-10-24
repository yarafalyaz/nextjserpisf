import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga konsumen AppDatePicker berlabel bintang wajib.
 *
 * Sesudah PR #458, label berakhiran " *" dirender bintang dekoratif
 * (aria-hidden); makna wajib untuk teknologi bantu hanya datang dari
 * `aria-required` di trigger, yang muncul bila prop `required` diteruskan.
 * Konsumen yang menampilkan bintang tetapi lupa `required` kehilangan
 * makna wajib itu. Tes ini mengunci 7 titik yang diperbaiki dan mencegah
 * regresi di berkas yang sama.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const CASES: Array<{ file: string; labels: string[] }> = [
  { file: "src/app/(dashboard)/keuangan/giro/_components/cheque-manager.tsx", labels: ["Jatuh Tempo *"] },
  { file: "src/app/(dashboard)/keuangan/penyetoran-pajak/_components/tax-payment-form.tsx", labels: ["Tanggal Setor *"] },
  { file: "src/app/(dashboard)/keuangan/transfer-bank/_components/bank-transfer-form.tsx", labels: ["Tanggal Transfer *"] },
  { file: "src/app/(dashboard)/pembelian/uang-muka/_components/purchase-advance-form.tsx", labels: ["Tanggal *"] },
  { file: "src/app/(dashboard)/penjualan/tukar-faktur/_components/invoice-exchange-form.tsx", labels: ["Tanggal Penyerahan *"] },
  {
    file: "src/app/(dashboard)/sdm/penggajian/_components/bulk-generate-payroll-button.tsx",
    labels: ["Tanggal Mulai Cut-off *", "Tanggal Selesai Cut-off *"],
  },
]

function pickerBlock(src: string, label: string): string {
  const start = src.indexOf(`label="${label}"`)
  if (start < 0) throw new Error(`label not found: ${label}`)
  const open = src.lastIndexOf("<AppDatePicker", start)
  const close = src.indexOf("/>", start)
  if (open < 0 || close < 0) throw new Error(`picker block not found: ${label}`)
  return src.slice(open, close)
}

describe("AppDatePicker: label bintang wajib diteruskan required (aria-required)", () => {
  for (const { file, labels } of CASES) {
    it(file, () => {
      const src = read(file)
      for (const label of labels) {
        expect(pickerBlock(src, label)).toContain("required")
      }
    })
  }
})
