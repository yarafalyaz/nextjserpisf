import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

/**
 * FIN-BR-008 (kartu t_bbe701da): sisa lane Frontend sesudah PR #1246.
 * PR #1246 sudah menutup badge daftar/detail/ubah pembayaran; yang dijaga
 * di sini: saringan reversed di hitung pembayaran SO + badge di 2 kartu
 * "pembayaran terakhir" dasbor. Falsifikasi: kembalikan literal lama
 * (hapus `status: { not: "reversed" }` / blok StatusChip) -> MERAH.
 */
describe("FIN-BR-008 badge reversed + saring SO (t_bbe701da)", () => {
  it("pesanan [slug]: realPaymentCount menyaring status reversed", () => {
    const src = source("src/app/(dashboard)/penjualan/pesanan/[slug]/page.tsx")
    expect(src).toContain('status: { not: "reversed" }')
  })

  it("finance-dashboard: baris reversed berlabel StatusChip", () => {
    const src = source("src/components/dashboard/finance-dashboard.tsx")
    expect(src).toContain('payment.status === "reversed"')
    expect(src).toContain('<StatusChip status="reversed"')
  })

  it("page dasbor: kartu pembayaran terakhir mobile + desktop berlabel", () => {
    const src = source("src/app/(dashboard)/page.tsx")
    expect(src).toContain('payment.status === "reversed"')
    expect(src.match(/<StatusChip status="reversed"/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
