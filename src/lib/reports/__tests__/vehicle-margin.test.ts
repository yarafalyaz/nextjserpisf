import { describe, expect, it } from "vitest"

import type { ProjectPlResult } from "@/lib/reports/project-pl"
import {
  VEHICLE_MARGIN_LABEL,
  buildVehicleMargin,
  type VehicleMarginInput,
} from "@/lib/reports/vehicle-margin"

function pl(over: Partial<ProjectPlResult> = {}): ProjectPlResult {
  return {
    projectId: 1,
    revenue: 0,
    materialCost: 0,
    productionCost: 0,
    expenseCost: 0,
    pettyCashCost: 0,
    vendorBillCost: 0,
    totalCost: 0,
    profit: 0,
    marginPercent: 0,
    revenueInvoiceIds: [],
    materialIssueIds: [],
    vendorBillIds: [],
    unpulledTimesheetHours: 0,
    unpulledTimesheetCount: 0,
    ...over,
  }
}

function base(over: Partial<VehicleMarginInput> = {}): VehicleMarginInput {
  return { projects: [], jobs: [], directInvoices: [], ...over }
}

describe("buildVehicleMargin — kriteria terima F-2026-10-21-033", () => {
  it("label kontrak verbatim", () => {
    expect(VEHICLE_MARGIN_LABEL).toBe("margin job kendaraan")
    expect(buildVehicleMargin(base()).label).toBe("margin job kendaraan")
  })

  it("kendaraan A: 2 proyek + 1 WO non-proyek = jumlah persis builder sumber", () => {
    const r = buildVehicleMargin(
      base({
        projects: [
          {
            customerVehicleId: 7,
            vehiclePlate: "B 1234 AA",
            customerName: "PT A",
            pl: pl({ revenue: 20_000_000, productionCost: 5_000_000, totalCost: 5_000_000, profit: 15_000_000 }),
          },
          {
            customerVehicleId: 7,
            vehiclePlate: "B 1234 AA",
            customerName: "PT A",
            pl: pl({ projectId: 2, revenue: 10_000_000, materialCost: 2_000_000, totalCost: 2_000_000, profit: 8_000_000 }),
          },
        ],
        jobs: [
          { workOrderId: 50, customerVehicleId: 7, vehiclePlate: "B 1234 AA", customerName: "PT A", billedAmount: 4_000_000, actualCost: 1_000_000, hasUnlinkedMaterial: false },
        ],
      }),
    )
    expect(r.rows).toHaveLength(1)
    const row = r.rows[0]
    expect(row.customerVehicleId).toBe(7)
    expect(row.revenue).toBe(34_000_000)
    expect(row.materialCost).toBe(2_000_000)
    expect(row.productionCost).toBe(6_000_000)
    expect(row.totalCost).toBe(8_000_000)
    expect(row.profit).toBe(26_000_000)
    expect(row.projectCount).toBe(2)
    expect(row.jobCount).toBe(1)
    expect(row.hasUnlinkedRevenue).toBe(false)
  })

  it("marginPercent dari agregat, bukan rata-rata marginPercent per proyek", () => {
    // Proyek besar margin 10%, proyek kecil margin 90%: rata-rata = 50%,
    // agregat = (11jt-10jt + 1jt-0.1jt... ) revenue 11jt profit 1.9jt.
    const r = buildVehicleMargin(
      base({
        projects: [
          { customerVehicleId: 7, vehiclePlate: null, customerName: "PT A", pl: pl({ revenue: 10_000_000, productionCost: 9_000_000, totalCost: 9_000_000, profit: 1_000_000, marginPercent: 10 }) },
          { customerVehicleId: 7, vehiclePlate: null, customerName: "PT A", pl: pl({ projectId: 2, revenue: 1_000_000, productionCost: 100_000, totalCost: 100_000, profit: 900_000, marginPercent: 90 }) },
        ],
      }),
    )
    expect(r.rows[0].marginPercent).toBe(17.27)
    expect(r.rows[0].marginPercent).not.toBe(50)
  })

  it("WO tanpa kendaraan masuk ember Tanpa kendaraan; total rekonsiliasi", () => {
    const r = buildVehicleMargin(
      base({
        projects: [
          { customerVehicleId: 7, vehiclePlate: "B 1", customerName: "PT A", pl: pl({ revenue: 5_000_000, totalCost: 1_000_000, productionCost: 1_000_000, profit: 4_000_000 }) },
        ],
        jobs: [
          { workOrderId: 51, customerVehicleId: null, vehiclePlate: null, customerName: "PT B", billedAmount: 3_000_000, actualCost: 500_000, hasUnlinkedMaterial: false },
        ],
      }),
    )
    expect(r.rows).toHaveLength(2)
    // Ember null selalu terakhir walau profit lebih kecil/besar.
    expect(r.rows[1].customerVehicleId).toBeNull()
    expect(r.rows[1].revenue).toBe(3_000_000)
    // Rekonsiliasi: total semua ember = total sumber.
    expect(r.totals.revenue).toBe(8_000_000)
    expect(r.totals.totalCost).toBe(1_500_000)
    expect(r.totals.profit).toBe(6_500_000)
  })

  it("MI langsung WO: penanda true, totalCost tidak berubah (Q-033-2)", () => {
    const r = buildVehicleMargin(
      base({
        jobs: [
          { workOrderId: 50, customerVehicleId: 7, vehiclePlate: "B 1234 AA", customerName: "PT A", billedAmount: 4_000_000, actualCost: 1_000_000, hasUnlinkedMaterial: true },
        ],
      }),
    )
    expect(r.rows[0].hasUnlinkedMaterial).toBe(true)
    expect(r.rows[0].totalCost).toBe(1_000_000)
    expect(r.rows[0].materialCost).toBe(0)
  })

  it("invoice langsung saja: tertanda parsial, bukan margin polos", () => {
    const r = buildVehicleMargin(
      base({
        directInvoices: [
          { id: 900, customerVehicleId: 9, vehiclePlate: "D 9", customerName: "PT C", revenue: 2_000_000 },
        ],
      }),
    )
    expect(r.rows[0].directInvoiceCount).toBe(1)
    expect(r.rows[0].hasUnlinkedRevenue).toBe(true)
    expect(r.rows[0].totalCost).toBe(0)
    expect(r.totals.directInvoiceCount).toBe(1)
  })

  it("plat sama dua pelanggan berbeda = dua baris (kunci ID)", () => {
    const r = buildVehicleMargin(
      base({
        jobs: [
          { workOrderId: 1, customerVehicleId: 7, vehiclePlate: "B 100", customerName: "PT A", billedAmount: 1_000_000, actualCost: 0, hasUnlinkedMaterial: false },
          { workOrderId: 2, customerVehicleId: 8, vehiclePlate: "B 100", customerName: "PT B", billedAmount: 2_000_000, actualCost: 0, hasUnlinkedMaterial: false },
        ],
      }),
    )
    expect(r.rows).toHaveLength(2)
    expect(new Set(r.rows.map((x) => x.customerVehicleId))).toEqual(new Set([7, 8]))
  })

  it("expense/petty/vendorBill proyek masuk otherCost warisan builder", () => {
    const r = buildVehicleMargin(
      base({
        projects: [
          { customerVehicleId: 7, vehiclePlate: null, customerName: "PT A", pl: pl({ revenue: 10_000_000, expenseCost: 300_000, pettyCashCost: 200_000, vendorBillCost: 500_000, totalCost: 1_000_000, profit: 9_000_000 }) },
        ],
      }),
    )
    expect(r.rows[0].otherCost).toBe(1_000_000)
    expect(r.rows[0].totalCost).toBe(1_000_000)
  })

  it("kosong: baris kosong, total nol, margin 0", () => {
    const r = buildVehicleMargin(base())
    expect(r.rows).toEqual([])
    expect(r.totals).toEqual({
      revenue: 0,
      totalCost: 0,
      profit: 0,
      marginPercent: 0,
      projectCount: 0,
      jobCount: 0,
      directInvoiceCount: 0,
      unbilledMemo: 0,
      unbilledByStatus: { draft: 0, approved: 0, sent: 0 },
    })
  })
})

describe("buildVehicleMargin — memo unbilled E129-4", () => {
  it("label memo verbatim + status sumber kontrak", async () => {
    const { VEHICLE_MARGIN_UNBILLED_LABEL, UNBILLED_MEMO_STATUSES } = await import(
      "@/lib/reports/vehicle-margin"
    )
    expect(VEHICLE_MARGIN_UNBILLED_LABEL).toBe("belum ditagih (memo)")
    expect(UNBILLED_MEMO_STATUSES).toEqual(["draft", "approved", "sent"])
    expect(buildVehicleMargin(base()).unbilledLabel).toBe("belum ditagih (memo)")
  })

  it("memo saja: baris revenue 0, profit/marginPercent tak bergerak, memo terisi per status", () => {
    const r = buildVehicleMargin(
      base({
        unbilled: [
          { id: 1, customerVehicleId: 7, vehiclePlate: "B 7", customerName: "PT A", status: "draft", amount: 40_000_000 },
          { id: 2, customerVehicleId: 7, vehiclePlate: "B 7", customerName: "PT A", status: "approved", amount: 5_000_000 },
          { id: 3, customerVehicleId: 7, vehiclePlate: "B 7", customerName: "PT A", status: "sent", amount: 3_000_000 },
        ],
      }),
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].revenue).toBe(0)
    expect(r.rows[0].profit).toBe(0)
    expect(r.rows[0].marginPercent).toBe(0)
    expect(r.rows[0].unbilledMemo).toBe(48_000_000)
    expect(r.rows[0].unbilledByStatus).toEqual({ draft: 40_000_000, approved: 5_000_000, sent: 3_000_000 })
    expect(r.totals.unbilledMemo).toBe(48_000_000)
    expect(r.totals.revenue).toBe(0)
    expect(r.totals.profit).toBe(0)
  })

  it("memo di kendaraan berbilled: revenue/profit/marginPercent identik tanpa memo", () => {
    const withJob = base({
      jobs: [
        { workOrderId: 50, customerVehicleId: 7, vehiclePlate: "B 7", customerName: "PT A", billedAmount: 10_000_000, actualCost: 4_000_000, hasUnlinkedMaterial: false },
      ],
    })
    const plain = buildVehicleMargin(withJob)
    const withMemo = buildVehicleMargin({
      ...withJob,
      unbilled: [
        { id: 9, customerVehicleId: 7, vehiclePlate: "B 7", customerName: "PT A", status: "draft", amount: 40_000_000 },
      ],
    })
    expect(withMemo.rows[0].revenue).toBe(plain.rows[0].revenue)
    expect(withMemo.rows[0].profit).toBe(plain.rows[0].profit)
    expect(withMemo.rows[0].marginPercent).toBe(plain.rows[0].marginPercent)
    expect(withMemo.totals.revenue).toBe(plain.totals.revenue)
    expect(withMemo.rows[0].unbilledMemo).toBe(40_000_000)
  })

  it("dedup global per id: invoice sama dua jembatan dihitung sekali (entri pertama)", () => {
    const r = buildVehicleMargin(
      base({
        unbilled: [
          { id: 42, customerVehicleId: 7, vehiclePlate: "B 7", customerName: "PT A", status: "draft", amount: 40_000_000 },
          { id: 42, customerVehicleId: 8, vehiclePlate: "B 8", customerName: "PT B", status: "draft", amount: 40_000_000 },
        ],
      }),
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].customerVehicleId).toBe(7)
    expect(r.totals.unbilledMemo).toBe(40_000_000)
  })

  it("status di luar draft/approved/sent (cancelled/posted) tidak masuk memo", () => {
    const r = buildVehicleMargin(
      base({
        unbilled: [
          { id: 1, customerVehicleId: 7, vehiclePlate: "B 7", customerName: "PT A", status: "cancelled", amount: 40_000_000 },
          { id: 2, customerVehicleId: 7, vehiclePlate: "B 7", customerName: "PT A", status: "posted", amount: 40_000_000 },
        ],
      }),
    )
    expect(r.rows).toEqual([])
    expect(r.totals.unbilledMemo).toBe(0)
  })

  it("memo tanpa kendaraan masuk ember Tanpa kendaraan, tetap terakhir", () => {
    const r = buildVehicleMargin(
      base({
        jobs: [
          { workOrderId: 1, customerVehicleId: 7, vehiclePlate: "B 7", customerName: "PT A", billedAmount: 1_000_000, actualCost: 0, hasUnlinkedMaterial: false },
        ],
        unbilled: [
          { id: 5, customerVehicleId: null, vehiclePlate: null, customerName: "PT B", status: "sent", amount: 2_000_000 },
        ],
      }),
    )
    expect(r.rows).toHaveLength(2)
    expect(r.rows[1].customerVehicleId).toBeNull()
    expect(r.rows[1].unbilledMemo).toBe(2_000_000)
    expect(r.rows[1].unbilledByStatus.sent).toBe(2_000_000)
  })
})
