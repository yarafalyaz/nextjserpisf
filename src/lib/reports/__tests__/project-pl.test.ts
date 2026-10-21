import { describe, expect, it } from "vitest"

import {
  buildProjectPl,
  type ProjectPlInput,
} from "@/lib/reports/project-pl"

function base(over: Partial<ProjectPlInput> = {}): ProjectPlInput {
  return {
    projectId: 1,
    invoices: [],
    workOrders: [],
    materialIssues: [],
    productionCosts: [],
    expenses: [],
    pettyCash: [],
    vendorBills: [],
    timesheets: [],
    ...over,
  }
}

function inv(over: Partial<ProjectPlInput["invoices"][number]> = {}) {
  return {
    id: 1,
    projectId: 1,
    quotationId: null,
    status: "posted",
    subtotal: 20_000_000,
    discount: 0,
    deletedAt: null,
    ...over,
  }
}

function wo(over: Partial<ProjectPlInput["workOrders"][number]> = {}) {
  return { id: 10, projectId: 1, quotationId: 100, status: "in_progress", ...over }
}

describe("buildProjectPl — kriteria terima F-2026-10-21-029", () => {
  it("fixture wajib: 1 WO + ProductionCost labor 5jt + invoice 20jt -> biaya memuat 5jt (bukan 0)", () => {
    const r = buildProjectPl(
      base({
        workOrders: [wo()],
        invoices: [inv()],
        productionCosts: [
          { workOrderId: 10, amount: 5_000_000, sourceTimesheetId: 7, purchaseOrderId: null },
        ],
        timesheets: [{ id: 7, projectId: 1, hours: 40 }],
      }),
    )

    expect(r.revenue).toBe(20_000_000)
    expect(r.productionCost).toBe(5_000_000)
    expect(r.totalCost).toBe(5_000_000)
    expect(r.profit).toBe(15_000_000)
    // Timesheet #7 sudah ditarik -> tidak muncul sebagai memo jam.
    expect(r.unpulledTimesheetHours).toBe(0)
    expect(r.unpulledTimesheetCount).toBe(0)
  })

  it("invoice jembatan WO (tanpa projectId, via quotation WO) tidak terhitung dobel dengan jalur langsung", () => {
    // Invoice yang sama terjangkau dua jembatan: projectId langsung DAN
    // quotationId yang tertaut WO proyek. Harus masuk sekali.
    const shared = inv({ id: 5, projectId: 1, quotationId: 100, subtotal: 20_000_000 })
    const bridgeOnly = inv({ id: 6, projectId: null, quotationId: 100, subtotal: 8_000_000 })

    const r = buildProjectPl(
      base({
        workOrders: [wo()],
        invoices: [shared, shared, bridgeOnly],
      }),
    )

    expect(r.revenueInvoiceIds).toEqual([5, 6])
    expect(r.revenue).toBe(28_000_000)
  })

  it("invoice proyek lain tidak bocor lewat quotation bersama; invoice cancelled/draft/deleted dibuang", () => {
    const r = buildProjectPl(
      base({
        workOrders: [wo(), wo({ id: 11, projectId: 2, quotationId: 200 })],
        invoices: [
          inv({ id: 1, projectId: 2, quotationId: null, subtotal: 99_000_000 }),
          inv({ id: 2, projectId: null, quotationId: 200, subtotal: 88_000_000 }),
          inv({ id: 3, status: "draft", subtotal: 77_000_000 }),
          inv({ id: 4, status: "cancelled", subtotal: 66_000_000 }),
          inv({ id: 5, status: "paid", subtotal: 55_000_000, deletedAt: new Date() }),
          inv({ id: 6, subtotal: 10_000_000, discount: 1_500_000 }),
        ],
      }),
    )

    expect(r.revenueInvoiceIds).toEqual([6])
    // Definisi page existing dipertahankan: subtotal − discount, tanpa pajak.
    expect(r.revenue).toBe(8_500_000)
  })

  it("WO cancelled tidak menjadi jembatan (invoice/MI/ProductionCost-nya tidak tertarik)", () => {
    const r = buildProjectPl(
      base({
        workOrders: [wo({ status: "cancelled" })],
        invoices: [inv({ id: 1, projectId: null, quotationId: 100 })],
        materialIssues: [
          { id: 1, projectId: null, workOrderId: 10, status: "completed", items: [{ qty: 2, cost: 100_000 }] },
        ],
        productionCosts: [
          { workOrderId: 10, amount: 5_000_000, sourceTimesheetId: null, purchaseOrderId: null },
        ],
      }),
    )

    expect(r.revenue).toBe(0)
    expect(r.materialCost).toBe(0)
    expect(r.productionCost).toBe(0)
  })

  it("material: langsung + jembatan WO dedup per MI; hanya completed; draft/cancelled dibuang", () => {
    const r = buildProjectPl(
      base({
        workOrders: [wo()],
        materialIssues: [
          // Punya projectId DAN workOrderId proyek yang sama -> sekali.
          { id: 1, projectId: 1, workOrderId: 10, status: "completed", items: [{ qty: 3, cost: 200_000 }] },
          { id: 2, projectId: null, workOrderId: 10, status: "completed", items: [{ qty: 1, cost: 50_000 }] },
          { id: 3, projectId: 1, workOrderId: null, status: "draft", items: [{ qty: 9, cost: 999_000 }] },
          { id: 4, projectId: 2, workOrderId: null, status: "completed", items: [{ qty: 9, cost: 999_000 }] },
        ],
      }),
    )

    expect(r.materialIssueIds).toEqual([1, 2])
    expect(r.materialCost).toBe(650_000)
  })

  it("beban lain: Expense approved saja, PettyCash OUT saja, VendorBill non-draft; cancelled dibuang", () => {
    const r = buildProjectPl(
      base({
        expenses: [
          { projectId: 1, status: "approved", amount: 300_000 },
          { projectId: 1, status: "draft", amount: 999_000 },
          { projectId: 2, status: "approved", amount: 888_000 },
        ],
        pettyCash: [
          { projectId: 1, type: "OUT", amount: 150_000 },
          { projectId: 1, type: "IN", amount: 777_000 },
        ],
        vendorBills: [
          { id: 1, projectId: 1, purchaseOrderId: null, status: "posted", grandTotal: 2_000_000, deletedAt: null },
          { id: 2, projectId: 1, purchaseOrderId: null, status: "draft", grandTotal: 999_000, deletedAt: null },
          { id: 3, projectId: 1, purchaseOrderId: null, status: "cancelled", grandTotal: 888_000, deletedAt: null },
        ],
      }),
    )

    expect(r.expenseCost).toBe(300_000)
    expect(r.pettyCashCost).toBe(150_000)
    expect(r.vendorBillIds).toEqual([1])
    expect(r.vendorBillCost).toBe(2_000_000)
    expect(r.totalCost).toBe(2_450_000)
  })

  it("anti-dobel backlog: VendorBill ber-PO yang sudah tercermin di ProductionCost dikeluarkan", () => {
    const r = buildProjectPl(
      base({
        workOrders: [wo()],
        productionCosts: [
          // Cerminan subkontrak PO jasa #900 (syncServicePoCostFromBills).
          { workOrderId: 10, amount: 4_000_000, sourceTimesheetId: null, purchaseOrderId: 900 },
        ],
        vendorBills: [
          // Tagihan PO yang sama, ber-projectId proyek ini -> dobel bila dihitung.
          { id: 1, projectId: 1, purchaseOrderId: 900, status: "posted", grandTotal: 4_000_000, deletedAt: null },
          // Tagihan proyek tanpa PO tertaut ProductionCost -> tetap beban.
          { id: 2, projectId: 1, purchaseOrderId: null, status: "posted", grandTotal: 1_000_000, deletedAt: null },
          // Tagihan ber-PO lain yang tidak tercermin -> tetap beban.
          { id: 3, projectId: 1, purchaseOrderId: 901, status: "paid", grandTotal: 500_000, deletedAt: null },
        ],
      }),
    )

    expect(r.productionCost).toBe(4_000_000)
    expect(r.vendorBillIds).toEqual([2, 3])
    expect(r.vendorBillCost).toBe(1_500_000)
    expect(r.totalCost).toBe(5_500_000)
  })

  it("memo jam: timesheet belum ditarik tampil sebagai jam saja, BUKAN uang; laba tidak berkurang", () => {
    const r = buildProjectPl(
      base({
        workOrders: [wo()],
        invoices: [inv({ subtotal: 20_000_000 })],
        productionCosts: [
          { workOrderId: 10, amount: 5_000_000, sourceTimesheetId: 7, purchaseOrderId: null },
        ],
        timesheets: [
          { id: 7, projectId: 1, hours: 40 },
          { id: 8, projectId: 1, hours: 12.5 },
          { id: 9, projectId: 2, hours: 99 },
        ],
      }),
    )

    expect(r.unpulledTimesheetCount).toBe(1)
    expect(r.unpulledTimesheetHours).toBe(12.5)
    expect(r.totalCost).toBe(5_000_000)
    expect(r.profit).toBe(15_000_000)
  })

  it("margin: revenue nol -> margin 0; laba negatif tidak di-clamp", () => {
    const rugi = buildProjectPl(
      base({
        invoices: [inv({ subtotal: 1_000_000 })],
        expenses: [{ projectId: 1, status: "approved", amount: 3_000_000 }],
      }),
    )
    expect(rugi.profit).toBe(-2_000_000)
    expect(rugi.marginPercent).toBe(-200)

    const kosong = buildProjectPl(base())
    expect(kosong.revenue).toBe(0)
    expect(kosong.marginPercent).toBe(0)
  })

  it("presisi sen: qty x cost dan subtotal-diskon tidak drift", () => {
    const r = buildProjectPl(
      base({
        invoices: [inv({ subtotal: 0.3, discount: 0.1 })],
        materialIssues: [
          { id: 1, projectId: 1, workOrderId: null, status: "completed", items: [{ qty: 0.1, cost: 0.7 }] },
        ],
      }),
    )
    expect(r.revenue).toBe(0.2)
    expect(r.materialCost).toBe(0.07)
  })
})
