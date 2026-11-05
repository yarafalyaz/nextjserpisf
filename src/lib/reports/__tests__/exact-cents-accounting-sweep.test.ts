import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Ratchet putaran 209: `formatAccounting()` default 0 desimal membuang sen.
 * Sapuan sebelumnya hanya menjaga `formatCurrency(`; laporan/keuangan yang
 * mencetak lewat `formatAccounting(` lolos, sehingga baris tabel dibulatkan
 * sementara baris totalnya (yang sudah memakai formatter eksak) tetap bersen —
 * total yang tercetak tidak sama dengan jumlah baris yang tercetak.
 *
 * Aturan: setiap `formatAccounting(` pada berkas ini WAJIB berupa
 * `formatAccountingExact(` atau meneruskan `decimals: 2` eksplisit.
 */
const FILES = [
  "src/lib/finance/invoice-exchange.ts",
  "src/lib/finance/purchase-advance.ts",
  "src/lib/finance/tax-payment.ts",
  "src/lib/reports/asset-reconciliation.ts",
  "src/lib/reports/financial-charts.ts",
  "src/lib/reports/journal-listing.ts",
  "src/lib/reports/skontro.ts",
  "src/lib/reports/statement-table.ts",
  "src/lib/reports/trial-balance-report.ts",
  "src/app/(dashboard)/laporan/arus-kas/[[...segments]]/page.tsx",
  "src/app/(dashboard)/laporan/bukti-potong-pph/[[...segments]]/page.tsx",
  "src/app/(dashboard)/laporan/multi-periode/[[...segments]]/page.tsx",
  "src/app/(dashboard)/laporan/perbandingan-periode/[[...segments]]/page.tsx",
  "src/app/(dashboard)/laporan/proyeksi-kas/[[...segments]]/page.tsx",
  "src/app/(dashboard)/laporan/riwayat-harga-jual/[[...segments]]/page.tsx",
  "src/app/(dashboard)/pembelian/perintah-pembayaran/[[...segments]]/page.tsx",
  "src/app/(dashboard)/penjualan/tukar-faktur/_components/invoice-exchange-form.tsx",
]

/**
 * Buang panggilan yang sudah eksak atau yang eksplisit 2 desimal.
 * Dicocokkan per BARIS: panggilan bisa memuat `)` di dalamnya
 * (`value.toNumber()`), jadi berhenti di `)` pertama akan salah menilai.
 */
function offendingCalls(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => /formatAccounting\((?!Exact)/.test(line))
    .filter((line) => !line.includes("decimals: 2"))
    // Pengecualian sadar: total laporan jurnal yang SEIMBANG dicetak rupiah
    // penuh (kontrak `journal-listing-cents.test.ts`); barisnya tetap eksak.
    .filter((line) => !line.includes("sweep-allow: balanced-total"))
}

describe("sapuan putaran 209: formatAccounting tanpa Exact", () => {
  it.each(FILES)("%s tidak membuang sen", (rel) => {
    const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
    expect(offendingCalls(source), `${rel} memakai formatAccounting 0 desimal`).toEqual([])
  })
})
