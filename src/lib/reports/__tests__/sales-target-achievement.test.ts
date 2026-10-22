import { describe, it, expect, vi } from "vitest"

/**
 * Laporan target vs pencapaian (F-2026-10-22-088-S tahap 1).
 * Kunci: AC-TGT-10 — pencapaian PERSIS paidBase rekap komisi untuk
 * periode+penjual sama (satu basis, dua laporan). Builder target dan
 * builder komisi diberi fixture faktur yang SAMA.
 * Plus: BR-TGT-05 periode tidak utuh tanpa prorata, BR-TGT-04/06
 * tanpa target persen kosong, BR-TGT-11 persen perusahaan tertimbang,
 * AC-TGT-4 penjaga tumpuk.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    salesTarget: { findMany: vi.fn() },
    salesInvoice: { findMany: vi.fn() },
    activityLog: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  buildSalesTargetAchievement,
  findOverlappingSalesTarget,
  salesTargetPeriodsOverlap,
  validateSalesTargetInput,
  SALES_TARGET_NOTICE,
  SALES_TARGET_UNATTRIBUTED_LABEL,
} from "../sales-target-achievement"
import { buildSalesCommissionRecap } from "../sales-commission"
import { getSalesTargetAchievement } from "../sales-target-achievement-data"

const OCT = { start: new Date(Date.UTC(2026, 9, 1)), end: new Date(Date.UTC(2026, 9, 31)) }

const target = (over: Partial<Parameters<typeof buildSalesTargetAchievement>[0]["targets"][number]> = {}) => ({
  id: 1,
  salesEmployeeId: 7,
  salesEmployeeName: "Rina",
  periodStart: OCT.start,
  periodEnd: OCT.end,
  targetAmount: 1_000_000,
  notes: null,
  modifiedAfterPeriodStartAt: null,
  ...over,
})

describe("AC-TGT-10: pencapaian == paidBase rekap komisi (fixture bersama)", () => {
  const invoices = [
    { salesEmployeeId: 7, salesEmployeeName: "Rina", date: new Date(Date.UTC(2026, 9, 5)), grandTotal: 400_000 },
    { salesEmployeeId: 7, salesEmployeeName: "Rina", date: new Date(Date.UTC(2026, 9, 20)), grandTotal: 350_000 },
    { salesEmployeeId: 3, salesEmployeeName: "Budi", date: new Date(Date.UTC(2026, 9, 7)), grandTotal: 200_000 },
    { salesEmployeeId: null, salesEmployeeName: null, date: new Date(Date.UTC(2026, 9, 9)), grandTotal: 90_000 },
  ]

  it("angka per penjual + unattributed identik dua builder", () => {
    const commission = buildSalesCommissionRecap(
      invoices.map((i) => ({ ...i, commissionPercent: 0 })),
    )
    const achievement = buildSalesTargetAchievement({
      targets: [target()],
      invoices,
      range: OCT,
    })
    const row7 = achievement.rows.find((r) => r.salesEmployeeId === 7)!
    const comm7 = commission.rows.find((r) => r.salesEmployeeId === 7)!
    expect(row7.achievedAmount).toBe(comm7.paidBase)
    expect(row7.achievedAmount).toBe(750_000)
    expect(row7.achievementPercent).toBe(75)
    expect(row7.gapAmount).toBe(-250_000)
    expect(row7.invoiceCount).toBe(comm7.invoiceCount)
    expect(achievement.unattributed.achievedAmount).toBe(commission.unattributed.paidBase)
    expect(achievement.unattributed.label).toBe(SALES_TARGET_UNATTRIBUTED_LABEL)
    expect(achievement.notice).toBe(SALES_TARGET_NOTICE)
    expect(achievement.notice).toMatch(/Retur penjualan tidak mengurangi/)
  })

  it("AC-TGT-2: unattributed tidak menaikkan persen penjual mana pun; AC-TGT-6 tanpa target persen kosong", () => {
    const r = buildSalesTargetAchievement({ targets: [target()], invoices, range: OCT })
    const budi = r.noTargetRows.find((x) => x.salesEmployeeId === 3)!
    expect(budi.hasTarget).toBe(false)
    expect(budi.achievementPercent).toBeNull()
    expect(budi.targetAmount).toBeNull()
    expect(budi.achievedAmount).toBe(200_000)
    expect(r.rows[0].achievedAmount).toBe(750_000) // unattributed 90rb tidak bocor ke Rina
    expect(r.totalAchievedAmount).toBe(750_000 + 90_000) // total perusahaan memuat unattributed
  })

  it("faktur di luar periode target tidak dihitung walau dalam rentang laporan", () => {
    const r = buildSalesTargetAchievement({
      targets: [target()],
      invoices: [
        ...invoices,
        { salesEmployeeId: 7, salesEmployeeName: "Rina", date: new Date(Date.UTC(2026, 10, 2)), grandTotal: 999_999 },
      ],
      range: { start: OCT.start, end: new Date(Date.UTC(2026, 10, 30)) },
    })
    expect(r.rows[0].achievedAmount).toBe(750_000)
  })
})

describe("BR-TGT-05/11: periode utuh & persen perusahaan tertimbang", () => {
  it("AC-TGT-5: periode terpotong rentang -> persen null, tanpa prorata", () => {
    const r = buildSalesTargetAchievement({
      targets: [target()],
      invoices: [{ salesEmployeeId: 7, salesEmployeeName: "Rina", date: new Date(Date.UTC(2026, 9, 5)), grandTotal: 400_000 }],
      range: { start: OCT.start, end: new Date(Date.UTC(2026, 9, 15)) },
    })
    expect(r.rows[0].periodFullyContained).toBe(false)
    expect(r.rows[0].achievementPercent).toBeNull()
    expect(r.rows[0].gapAmount).toBeNull()
    expect(r.rows[0].achievedAmount).toBe(400_000) // pencapaian tetap terbaca, persen tidak
    expect(r.companyPercent).toBeNull()
  })

  it("AC-TGT-7: persen perusahaan tertimbang nilai, bukan rata-rata persen", () => {
    const targets = [
      target(),
      target({ id: 2, salesEmployeeId: 3, salesEmployeeName: "Budi", targetAmount: 100_000 }),
    ]
    const invoices = [
      { salesEmployeeId: 7, salesEmployeeName: "Rina", date: new Date(Date.UTC(2026, 9, 5)), grandTotal: 500_000 }, // 50%
      { salesEmployeeId: 3, salesEmployeeName: "Budi", date: new Date(Date.UTC(2026, 9, 5)), grandTotal: 100_000 }, // 100%
    ]
    const r = buildSalesTargetAchievement({ targets, invoices, range: OCT })
    // Tertimbang: 600rb / 1,1jt = 54,55. Rata-rata sederhana (50+100)/2=75 = MERAH.
    expect(r.companyPercent).toBe(54.55)
    expect(r.totalTargetAmount).toBe(1_100_000)
    expect(r.totalAchievedForPercent).toBe(600_000)
  })
})

describe("BR-TGT-03/04: penjaga periode & nominal", () => {
  const d = (day: number) => new Date(Date.UTC(2026, 9, day))
  it("AC-TGT-4: tumpuk ditolak; bersebelahan & beda penjual sah", () => {
    expect(salesTargetPeriodsOverlap(d(1), d(31), d(15), d(20))).toBe(true)
    expect(salesTargetPeriodsOverlap(d(1), d(31), d(31), d(31))).toBe(true) // ujung inklusif
    const existing = [{ id: 1, periodStart: d(1), periodEnd: d(31) }]
    expect(findOverlappingSalesTarget(existing, { periodStart: d(20), periodEnd: d(25) })?.id).toBe(1)
    // Bersebelahan: start = end+1
    const nov1 = new Date(Date.UTC(2026, 10, 1))
    expect(findOverlappingSalesTarget(existing, { periodStart: nov1, periodEnd: new Date(Date.UTC(2026, 10, 30)) })).toBeNull()
    // Ubah diri sendiri dikecualikan
    expect(findOverlappingSalesTarget(existing, { periodStart: d(1), periodEnd: d(31), excludeId: 1 })).toBeNull()
  })
  it("BR-TGT-04: target 0/negatif & periode terbalik ditolak", () => {
    expect(validateSalesTargetInput({ targetAmount: 0, periodStart: d(1), periodEnd: d(31) })).toMatch(/lebih besar dari 0/)
    expect(validateSalesTargetInput({ targetAmount: -5, periodStart: d(1), periodEnd: d(31) })).toMatch(/lebih besar dari 0/)
    expect(validateSalesTargetInput({ targetAmount: 100, periodStart: d(31), periodEnd: d(1) })).toMatch(/tidak boleh sebelum/)
    expect(validateSalesTargetInput({ targetAmount: 100, periodStart: d(1), periodEnd: d(31) })).toBeNull()
  })
})

describe("loader getSalesTargetAchievement", () => {
  it("memakai basis komisi (paid, deletedAt null) + lencana diubah dari ActivityLog", async () => {
    mocks.prismaMock.salesTarget.findMany.mockResolvedValue([
      {
        id: 1,
        salesEmployeeId: 7,
        periodStart: OCT.start,
        periodEnd: OCT.end,
        targetAmount: 1_000_000,
        notes: null,
        salesEmployee: { name: "Rina" },
      },
    ])
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { salesEmployeeId: 7, date: new Date(Date.UTC(2026, 9, 5)), grandTotal: 500_000, salesEmployee: { name: "Rina" } },
      { salesEmployeeId: null, date: new Date(Date.UTC(2026, 9, 6)), grandTotal: 10_000, salesEmployee: null },
    ])
    mocks.prismaMock.activityLog.findMany.mockResolvedValue([
      { modelId: 1, createdAt: new Date(Date.UTC(2026, 9, 10)) },
    ])
    const r = await getSalesTargetAchievement(OCT)
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledTimes(1)
    const where = mocks.prismaMock.salesInvoice.findMany.mock.calls[0][0].where
    expect(where.status).toBe("paid")
    expect(where.deletedAt).toBeNull()
    expect(r.rows[0].achievedAmount).toBe(500_000)
    expect(r.rows[0].modifiedAfterPeriodStartAt).toEqual(new Date(Date.UTC(2026, 9, 10)))
    expect(r.unattributed.invoiceCount).toBe(1)
  })
})
