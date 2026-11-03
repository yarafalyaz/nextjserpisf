import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

// Putaran 97: payment-status.ts memutuskan baris pembayaran reversed TETAP
// tampil di daftar (histori) tetapi wajib berlabel. Dua permukaan dasbor
// (dasbor utama + FinanceDashboard) menampilkan pembayaran terbaru tanpa
// label apa pun, jadi pembayaran yang sudah dibalik terlihat seperti uang
// masuk yang sah.
const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/(dashboard)/page.tsx"),
  "utf8",
)
const finance = fs.readFileSync(
  path.join(process.cwd(), "src/components/dashboard/finance-dashboard.tsx"),
  "utf8",
)
const chip = fs.readFileSync(
  path.join(process.cwd(), "src/components/ui/status-chip.tsx"),
  "utf8",
)
const charts = fs.readFileSync(
  path.join(process.cwd(), "src/components/dashboard/charts.tsx"),
  "utf8",
)

describe("label pembayaran reversed di dasbor (putaran 97)", () => {
  it("dasbor utama memberi chip Dibalik pada daftar mobile dan tabel desktop", () => {
    expect(page).toContain('from "@/lib/finance/payment-status"')
    expect(page.match(/isReversedPayment\(payment\)/g)).toHaveLength(2)
    expect(page).toContain("<StatusChip status={payment.status} />")
  })

  it("FinanceDashboard memberi chip Dibalik pada pembayaran terbaru", () => {
    expect(finance).toContain('from "@/lib/finance/payment-status"')
    expect(finance).toContain("isReversedPayment(payment)")
    expect(finance).toContain("<StatusChip status={payment.status} />")
  })

  it("chip reversed bertone danger (bukan default abu)", () => {
    expect(chip).toContain("reversed: 'danger'")
  })
})

describe("RevenueChart dasbor (putaran 97)", () => {
  it("jendela grafik berjangkar hari ini, bukan tanggal data terakhir", () => {
    expect(charts).toContain("const refDate = new Date()")
    expect(charts).not.toContain("data[data.length - 1].date")
  })

  it("agregat pendapatan memakai tanggal dokumen faktur, bukan created_at", () => {
    expect(page).toContain("DATE_FORMAT(date, '%Y-%m-%d') as date")
    expect(page).toContain("WHERE date >= ${ninetyDaysAgo}")
    expect(page).not.toContain("DATE_FORMAT(created_at, '%Y-%m-%d') as date")
  })
})
