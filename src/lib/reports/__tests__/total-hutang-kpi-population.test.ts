import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * "Total Ditagihkan"/"Sudah Dibayar" di KPI Total Hutang menjumlah SEMUA
 * tagihan pada populasi, sedangkan seksi "Hutang per Pemasok" hanya memuat
 * tagihan yang masih bersisa. Tanpa pembeda, dua angka berlabel sama dalam
 * satu laporan tampak bertentangan (mis. KPI 1.500.000 vs baris TOTAL 500.000).
 */

const mocks = vi.hoisted(() => ({ prismaMock: { vendorBill: { findMany: vi.fn() } } }))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { buildPayablesSummary } from "../payables-summary"

function bills() {
  return [
    // Lunas penuh — hanya masuk KPI populasi, tidak masuk seksi pemasok.
    {
      vendorId: 1,
      vendorName: "PT Lunas",
      documentNo: "VB-A",
      dueDate: new Date("2026-09-01"),
      grandTotal: 1_000_000,
      paidAmount: 1_000_000,
      withholdingAmount: 0,
      balanceDue: 0,
    },
    // Masih bersisa — masuk keduanya.
    {
      vendorId: 2,
      vendorName: "PT Buka",
      documentNo: "VB-B",
      dueDate: new Date("2026-10-01"),
      grandTotal: 500_000,
      paidAmount: 0,
      withholdingAmount: 0,
      balanceDue: 500_000,
    },
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("buildPayablesSummary — populasi KPI vs seksi pemasok", () => {
  it("KPI populasi mencakup tagihan lunas, seksi pemasok hanya yang bersisa", () => {
    const summary = buildPayablesSummary(bills(), new Date("2026-10-31"))

    expect(summary.totalBilled).toBe(1_500_000)
    expect(summary.totalPaid).toBe(1_000_000)
    const vendorBilled = summary.vendors.reduce((sum, vendor) => sum + vendor.totalBilled, 0)
    const vendorPaid = summary.vendors.reduce((sum, vendor) => sum + vendor.totalPaid, 0)
    expect(vendorBilled).toBe(500_000)
    expect(vendorPaid).toBe(0)
    expect(summary.vendors).toHaveLength(1)
  })

  it("label KPI dan seksi membedakan populasi semuanya vs bersisa", () => {
    const page = readFileSync(
      path.resolve(__dirname, "../../../app/(dashboard)/laporan/total-hutang/page.tsx"),
      "utf8",
    )
    expect(page).toContain("Total Ditagihkan (semua tagihan)")
    expect(page).toContain("Sudah Dibayar (semua tagihan)")
    expect(page).toContain("Hanya tagihan yang masih bersisa")
  })
})
