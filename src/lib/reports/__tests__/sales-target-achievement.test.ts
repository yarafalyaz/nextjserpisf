import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Laporan target vs pencapaian (F-2026-10-22-088-S tahap 1 +
 * F-2026-10-24-131-V tahap 2 basis NETO).
 * Kunci rekonsiliasi (pengganti AC-TGT-10 lama): grossPaidAmount
 * PERSIS paidBase rekap komisi untuk periode+penjual sama, dan
 * achievedAmount == grossPaidAmount − returnDeductionAmount.
 * Falsifikasi E131-1..5 dari vonis F-131-V.
 * Plus: BR-TGT-05 periode tidak utuh tanpa prorata, BR-TGT-04 tanpa
 * target persen kosong, BR-TGT-11 persen perusahaan tertimbang,
 * AC-TGT-4 penjaga tumpuk.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  prismaMock: {
    salesTarget: { findMany: vi.fn() },
    salesInvoice: { findMany: vi.fn() },
    salesReturn: { findMany: vi.fn() },
    journal: { findMany: vi.fn() },
    activityLog: { findMany: vi.fn() },
  },
  getSystemSettings: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: mocks.getSystemSettings,
}))

import {
  buildSalesTargetAchievement,
  buildSalesTargetPeriodReconciliation,
  findOverlappingSalesTarget,
  salesTargetPeriodsOverlap,
  validateSalesTargetInput,
  SALES_TARGET_NOTICE,
  SALES_TARGET_UNATTRIBUTED_LABEL,
} from "../sales-target-achievement"
import { buildSalesCommissionRecap } from "../sales-commission"
import {
  getSalesTargetAchievement,
  getSalesTargetPeriodReconciliation,
  listSalesTargets,
} from "../sales-target-achievement-data"

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

describe("Kunci rekonsiliasi F-131-V (pengganti AC-TGT-10): gross == paidBase komisi (fixture bersama)", () => {
  const invoices = [
    { id: 11, salesEmployeeId: 7, salesEmployeeName: "Rina", date: new Date(Date.UTC(2026, 9, 5)), grandTotal: 400_000, subtotal: 400_000, discount: 0, taxAmount: 0 },
    { id: 12, salesEmployeeId: 7, salesEmployeeName: "Rina", date: new Date(Date.UTC(2026, 9, 20)), grandTotal: 350_000, subtotal: 350_000, discount: 0, taxAmount: 0 },
    { id: 13, salesEmployeeId: 3, salesEmployeeName: "Budi", date: new Date(Date.UTC(2026, 9, 7)), grandTotal: 200_000, subtotal: 200_000, discount: 0, taxAmount: 0 },
    { id: 14, salesEmployeeId: null, salesEmployeeName: null, date: new Date(Date.UTC(2026, 9, 9)), grandTotal: 90_000, subtotal: 90_000, discount: 0, taxAmount: 0 },
  ]

  it("angka bruto per penjual + unattributed identik dua builder; neto = bruto tanpa retur", () => {
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
    // Kunci rekonsiliasi (i): komponen BRUTO target == paidBase komisi.
    expect(row7.grossPaidAmount).toBe(comm7.paidBase)
    expect(row7.grossPaidAmount).toBe(750_000)
    expect(row7.returnDeductionAmount).toBe(0)
    expect(row7.achievedAmount).toBe(750_000)
    expect(row7.achievementPercent).toBe(75)
    expect(row7.gapAmount).toBe(-250_000)
    expect(row7.invoiceCount).toBe(comm7.invoiceCount)
    expect(achievement.unattributed.grossPaidAmount).toBe(commission.unattributed.paidBase)
    expect(achievement.unattributed.achievedAmount).toBe(commission.unattributed.paidBase)
    expect(achievement.unattributed.label).toBe(SALES_TARGET_UNATTRIBUTED_LABEL)
    expect(achievement.totalGrossPaidAmount).toBe(840_000)
    expect(achievement.totalReturnDeductionAmount).toBe(0)
    expect(achievement.notice).toBe(SALES_TARGET_NOTICE)
    expect(achievement.notice).toMatch(/Retur penjualan selesai \(completed\) mengurangi/)
    expect(achievement.notice).not.toMatch(/tidak mengurangi pencapaian/)
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
        { id: 15, salesEmployeeId: 7, salesEmployeeName: "Rina", date: new Date(Date.UTC(2026, 10, 2)), grandTotal: 999_999, subtotal: 999_999, discount: 0, taxAmount: 0 },
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

describe("E131-1..5 falsifikasi vonis F-131-V (builder)", () => {
  const inv = (over: Record<string, unknown> = {}) => ({
    id: 101,
    salesEmployeeId: 7,
    salesEmployeeName: "A",
    date: new Date(Date.UTC(2026, 9, 10)),
    grandTotal: 10_000_000,
    subtotal: 10_000_000,
    discount: 0,
    taxAmount: 0,
    ...over,
  })

  it("E131-1: neto periode sama + rekonsiliasi komisi tertelusur", () => {
    const invoices = [inv()]
    const achievement = buildSalesTargetAchievement({
      targets: [target({ targetAmount: 20_000_000 })],
      invoices,
      returns: [
        {
          id: 501,
          date: new Date(Date.UTC(2026, 9, 15)),
          salesInvoiceId: 101,
          lines: [{ qty: 1, price: 1_500_000, returnDpp: 1_500_000, returnVat: 0 }],
        },
      ],
      range: OCT,
    })
    const row = achievement.rows[0]
    expect(row.grossPaidAmount).toBe(10_000_000)
    expect(row.returnDeductionAmount).toBe(1_500_000)
    expect(row.achievedAmount).toBe(8_500_000)
    expect(row.achievementPercent).toBe(42.5)
    const commission = buildSalesCommissionRecap(
      invoices.map((i) => ({ ...i, commissionPercent: 0 })),
    )
    expect(commission.rows[0].paidBase).toBe(10_000_000)
    expect(row.grossPaidAmount - commission.rows[0].paidBase).toBe(0)
    expect(commission.rows[0].paidBase - row.achievedAmount).toBe(1_500_000)
    const recon = buildSalesTargetPeriodReconciliation({
      achievement,
      invoices,
      commissionRows: [{ salesEmployeeId: 7, paidBase: 10_000_000 }],
      independentReturns: [
        { salesInvoiceId: 101, salesEmployeeId: 7, lines: [{ returnDpp: 1_500_000, returnVat: 0, qty: 1, price: 1_500_000 }] },
      ],
      postedJournalReturn: { debitAmount: 1_500_000 },
    })
    expect(recon.totals.grossPaidAmount).toBe(10_000_000)
    expect(recon.totals.commissionDifference).toBe(0)
    expect(recon.totals.independentDifference).toBe(0)
    expect(recon.totals.journalDifference).toBe(0)
    expect(recon.findings).toEqual([])
    expect(recon.rows[0].findings).toEqual([])
  })

  it("E131-2: beda periode — November berkurang, Oktober tidak ditulis ulang", () => {
    const NOV = { start: new Date(Date.UTC(2026, 10, 1)), end: new Date(Date.UTC(2026, 10, 30)) }
    const invoices = [
      inv({ id: 201, date: new Date(Date.UTC(2026, 9, 10)), grandTotal: 12_000_000, subtotal: 12_000_000 }),
      inv({ id: 202, date: new Date(Date.UTC(2026, 10, 5)), grandTotal: 5_000_000, subtotal: 5_000_000 }),
    ]
    const returns = [
      {
        id: 502,
        date: new Date(Date.UTC(2026, 10, 12)),
        salesInvoiceId: 201,
        lines: [{ qty: 1, price: 3_000_000, returnDpp: 3_000_000, returnVat: 0 }],
      },
    ]
    const oct = buildSalesTargetAchievement({
      targets: [target({ targetAmount: 10_000_000 })],
      invoices,
      returns,
      range: OCT,
    })
    expect(oct.rows[0].grossPaidAmount).toBe(12_000_000)
    expect(oct.rows[0].returnDeductionAmount).toBe(0)
    expect(oct.rows[0].achievedAmount).toBe(12_000_000)
    expect(oct.rows[0].achievementPercent).toBe(120)
    const nov = buildSalesTargetAchievement({
      targets: [
        target({
          id: 2,
          periodStart: NOV.start,
          periodEnd: NOV.end,
          targetAmount: 10_000_000,
        }),
      ],
      invoices,
      returns,
      range: NOV,
    })
    expect(nov.rows[0].grossPaidAmount).toBe(5_000_000)
    expect(nov.rows[0].returnDeductionAmount).toBe(3_000_000)
    expect(nov.rows[0].achievedAmount).toBe(2_000_000)
    expect(nov.rows[0].achievementPercent).toBe(20)
    // Baca ulang Oktober sesudah retur ada: tetap 12jt.
    const octAgain = buildSalesTargetAchievement({
      targets: [target({ targetAmount: 10_000_000 })],
      invoices,
      returns,
      range: OCT,
    })
    expect(octAgain.rows[0].achievedAmount).toBe(12_000_000)
  })

  it("E131-3: pengurang = DPP+PPN snapshot (bukan cost, bukan DPP saja)", () => {
    const invoices = [
      inv({ id: 301, grandTotal: 11_100_000, subtotal: 10_000_000, taxAmount: 1_100_000 }),
    ]
    const achievement = buildSalesTargetAchievement({
      targets: [target({ targetAmount: 20_000_000 })],
      invoices,
      returns: [
        {
          id: 503,
          date: new Date(Date.UTC(2026, 9, 15)),
          salesInvoiceId: 301,
          // cost 3jt TIDAK ada di kontrak builder — price beku 5jt yang dipakai.
          lines: [{ qty: 1, price: 5_000_000, returnDpp: 5_000_000, returnVat: 550_000 }],
        },
      ],
      range: OCT,
    })
    expect(achievement.rows[0].returnDeductionAmount).toBe(5_550_000)
    expect(achievement.rows[0].achievedAmount).toBe(5_550_000)
  })

  it("E131-3b: baris legacy tanpa snapshot diturunkan qty×price + PPN tarif asal", () => {
    const invoices = [
      inv({ id: 302, grandTotal: 11_100_000, subtotal: 10_000_000, taxAmount: 1_100_000 }),
    ]
    const achievement = buildSalesTargetAchievement({
      targets: [target({ targetAmount: 20_000_000 })],
      invoices,
      returns: [
        {
          id: 504,
          date: new Date(Date.UTC(2026, 9, 15)),
          salesInvoiceId: 302,
          lines: [{ qty: 1, price: 5_000_000, returnDpp: null, returnVat: null }],
        },
      ],
      range: OCT,
    })
    expect(achievement.rows[0].returnDeductionAmount).toBe(5_550_000)
    expect(achievement.rows[0].achievedAmount).toBe(5_550_000)
  })

  it("E131-4b: negatif tampil apa adanya, tidak di-floor; retur tanpa target masuk baris tanpa target", () => {
    const invoices = [
      inv({ id: 401, salesEmployeeId: 3, salesEmployeeName: "B", grandTotal: 1_000_000, subtotal: 1_000_000 }),
      inv({ id: 402, salesEmployeeId: 3, salesEmployeeName: "B", date: new Date(Date.UTC(2026, 8, 5)), grandTotal: 4_000_000, subtotal: 4_000_000 }),
    ]
    const returns = [
      {
        id: 505,
        date: new Date(Date.UTC(2026, 9, 20)),
        salesInvoiceId: 402,
        lines: [{ qty: 1, price: 4_000_000, returnDpp: 4_000_000, returnVat: 0 }],
      },
    ]
    const withTarget = buildSalesTargetAchievement({
      targets: [target({ id: 9, salesEmployeeId: 3, salesEmployeeName: "B", targetAmount: 10_000_000 })],
      invoices,
      returns,
      range: OCT,
    })
    expect(withTarget.rows[0].grossPaidAmount).toBe(1_000_000)
    expect(withTarget.rows[0].returnDeductionAmount).toBe(4_000_000)
    expect(withTarget.rows[0].achievedAmount).toBe(-3_000_000)
    expect(withTarget.rows[0].achievementPercent).toBe(-30)
    const noTarget = buildSalesTargetAchievement({ targets: [], invoices, returns, range: OCT })
    const bRow = noTarget.noTargetRows.find((r) => r.salesEmployeeId === 3)!
    expect(bRow.returnDeductionAmount).toBe(4_000_000)
    expect(bRow.achievedAmount).toBe(-3_000_000)
    expect(bRow.achievementPercent).toBeNull()
  })

  it("E131-5: plafon per faktur + temuan bernama; notice baru tanpa klaim lama", () => {
    const invoices = [
      inv({ id: 301, grandTotal: 11_100_000, subtotal: 10_000_000, taxAmount: 1_100_000 }),
    ]
    const achievement = buildSalesTargetAchievement({
      targets: [target({ targetAmount: 20_000_000 })],
      invoices,
      returns: [
        {
          id: 506,
          date: new Date(Date.UTC(2026, 9, 15)),
          salesInvoiceId: 301,
          lines: [{ qty: 1, price: 5_000_000, returnDpp: 5_000_000, returnVat: 550_000 }],
        },
        {
          id: 507,
          date: new Date(Date.UTC(2026, 9, 16)),
          salesInvoiceId: 301,
          // Bypass guard F-004: kumulatif DPP 11jt > DPP asal 10jt.
          lines: [{ qty: 1, price: 6_000_000, returnDpp: 6_000_000, returnVat: 660_000 }],
        },
      ],
      range: OCT,
    })
    expect(achievement.rows[0].returnDeductionAmount).toBeLessThanOrEqual(11_100_000)
    expect(achievement.invoiceDeductionClampFindings).toEqual([
      {
        salesInvoiceId: 301,
        salesEmployeeId: 7,
        grandTotal: 11_100_000,
        rawDeductionAmount: 12_210_000,
        clampedDeductionAmount: 11_100_000,
      },
    ])
    expect(achievement.notice).toContain("Retur penjualan selesai (completed) mengurangi")
    expect(achievement.notice).not.toContain("tidak mengurangi")
  })
})

describe("loader getSalesTargetAchievement", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 7 })
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([])
    mocks.getSystemSettings.mockResolvedValue({ salesReturnAccountId: 42 })
  })

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
      { id: 11, salesEmployeeId: 7, date: new Date(Date.UTC(2026, 9, 5)), grandTotal: 500_000, subtotal: 500_000, discount: 0, taxAmount: 0, salesEmployee: { name: "Rina" } },
      { id: 12, salesEmployeeId: null, date: new Date(Date.UTC(2026, 9, 6)), grandTotal: 10_000, subtotal: 10_000, discount: 0, taxAmount: 0, salesEmployee: null },
    ])
    mocks.prismaMock.activityLog.findMany.mockResolvedValue([
      { modelId: 1, createdAt: new Date(Date.UTC(2026, 9, 10)) },
    ])
    const r = await getSalesTargetAchievement(OCT)
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledTimes(1)
    const where = mocks.prismaMock.salesInvoice.findMany.mock.calls[0][0].where
    expect(where.status).toBe("paid")
    expect(where.deletedAt).toBeNull()
    expect(r.rows[0].achievedAmount).toBe(500_000)
    expect(r.rows[0].grossPaidAmount).toBe(500_000)
    expect(r.rows[0].modifiedAfterPeriodStartAt).toEqual(new Date(Date.UTC(2026, 9, 10)))
    expect(r.unattributed.invoiceCount).toBe(1)
  })

  it("E131-4a loader: hanya retur completed tertaut faktur paid dalam query; nol jurnal dari loader", async () => {
    mocks.prismaMock.salesTarget.findMany.mockResolvedValue([
      {
        id: 1,
        salesEmployeeId: 7,
        periodStart: OCT.start,
        periodEnd: OCT.end,
        targetAmount: 20_000_000,
        notes: null,
        salesEmployee: { name: "Rina" },
      },
    ])
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, salesEmployeeId: 7, date: new Date(Date.UTC(2026, 9, 5)), grandTotal: 10_000_000, subtotal: 10_000_000, discount: 0, taxAmount: 0, salesEmployee: { name: "Rina" } },
    ])
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([
      {
        id: 501,
        date: new Date(Date.UTC(2026, 9, 15)),
        salesInvoiceId: 11,
        items: [{ qty: 1, price: 2_000_000, returnDpp: 2_000_000, returnVat: 0 }],
      },
    ])
    mocks.prismaMock.activityLog.findMany.mockResolvedValue([])
    const r = await getSalesTargetAchievement(OCT)
    const retWhere = mocks.prismaMock.salesReturn.findMany.mock.calls[0][0].where
    expect(retWhere.status).toBe("completed")
    expect(retWhere.salesInvoiceId).toEqual({ in: [11] })
    expect(r.rows[0].grossPaidAmount).toBe(10_000_000)
    expect(r.rows[0].returnDeductionAmount).toBe(2_000_000)
    expect(r.rows[0].achievedAmount).toBe(8_000_000)
    // E131-5: loader read-only — tidak ada mock tulis jurnal dipanggil.
    expect(mocks.prismaMock.journal.findMany).not.toHaveBeenCalled()
  })

  // LOW-2 audit #583: loader menolak sebelum query bila izin tiada.
  it("tanpa view_reports: melempar sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("NEXT_REDIRECT"))
    await expect(getSalesTargetAchievement(OCT)).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.prismaMock.salesTarget.findMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.salesInvoice.findMany).not.toHaveBeenCalled()
  })
})

describe("loader getSalesTargetPeriodReconciliation (F-131-V Putusan 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 7 })
    mocks.getSystemSettings.mockResolvedValue({ salesReturnAccountId: 42 })
  })

  it("tiga arah cocok; jurnal POSTED dibaca dari kaki Retur Penjualan", async () => {
    mocks.prismaMock.salesTarget.findMany.mockResolvedValue([
      {
        id: 1,
        salesEmployeeId: 7,
        periodStart: OCT.start,
        periodEnd: OCT.end,
        targetAmount: 20_000_000,
        notes: null,
        salesEmployee: { name: "Rina" },
      },
    ])
    const paidInvoices = [
      { id: 11, salesEmployeeId: 7, date: new Date(Date.UTC(2026, 9, 5)), grandTotal: 10_000_000, subtotal: 10_000_000, discount: 0, taxAmount: 0, salesEmployee: { name: "Rina" } },
    ]
    // Dipanggil 2x: achievement (cakupan gabungan) + rekonsiliasi (periode).
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue(paidInvoices)
    const retRows = [
      {
        id: 501,
        date: new Date(Date.UTC(2026, 9, 15)),
        salesInvoiceId: 11,
        items: [{ qty: 1, price: 1_500_000, returnDpp: 1_500_000, returnVat: 0 }],
      },
    ]
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue(retRows)
    mocks.prismaMock.activityLog.findMany.mockResolvedValue([])
    mocks.prismaMock.journal.findMany.mockResolvedValue([
      { entries: [{ debit: 1_500_000 }] },
    ])
    const recon = await getSalesTargetPeriodReconciliation(OCT)
    expect(recon.totals.grossPaidAmount).toBe(10_000_000)
    expect(recon.totals.commissionPaidBase).toBe(10_000_000)
    expect(recon.totals.commissionDifference).toBe(0)
    expect(recon.totals.returnDeductionAmount).toBe(1_500_000)
    expect(recon.totals.independentReturnDeductionAmount).toBe(1_500_000)
    expect(recon.totals.independentDifference).toBe(0)
    expect(recon.totals.postedJournalReturnAmount).toBe(1_500_000)
    expect(recon.totals.journalDifference).toBe(0)
    expect(recon.totals.achievedAmount).toBe(8_500_000)
    const journalWhere = mocks.prismaMock.journal.findMany.mock.calls[0][0].where
    expect(journalWhere.status).toBe("POSTED")
    expect(journalWhere.referenceType).toBe("SalesReturn")
    expect(journalWhere.deletedAt).toBeNull()
  })
})

describe("loader listSalesTargets (LOW-2 audit #583)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 7 })
  })

  it("gerbang approve_sales_invoices sebelum query target aktif", async () => {
    mocks.prismaMock.salesTarget.findMany.mockResolvedValue([
      {
        id: 1,
        salesEmployeeId: 7,
        periodStart: OCT.start,
        periodEnd: OCT.end,
        targetAmount: 1_000_000,
        notes: null,
        updatedAt: new Date(),
        salesEmployee: { name: "Rina", isActive: true },
      },
    ])
    const rows = await listSalesTargets()
    expect(mocks.requirePermission).toHaveBeenCalledWith("approve_sales_invoices")
    expect(mocks.prismaMock.salesTarget.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.salesTarget.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
    })
    expect(rows).toHaveLength(1)
  })

  it("tanpa approve_sales_invoices: melempar sebelum query", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("NEXT_REDIRECT"))
    await expect(listSalesTargets()).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.prismaMock.salesTarget.findMany).not.toHaveBeenCalled()
  })
})
