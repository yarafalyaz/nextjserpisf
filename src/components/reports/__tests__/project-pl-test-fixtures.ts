import { buildProjectPl, type ProjectPlInput } from "@/lib/reports/project-pl"
import type { ProjectPlRow } from "@/lib/reports/project-pl-data"

// Fixture bersama tes kartu L/R proyek (PR #299): Sonar menandai blok
// salin-tempel antar berkas tes sebagai duplikasi; simpan sekali di sini.
export function projectPlBase(over: Partial<ProjectPlInput> = {}): ProjectPlInput {
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

export function projectPlWithCost() {
  return buildProjectPl(
    projectPlBase({
      workOrders: [{ id: 10, projectId: 1, quotationId: 100, status: "in_progress" }],
      invoices: [
        { id: 1, projectId: 1, quotationId: null, status: "posted", subtotal: 20_000_000, discount: 0, deletedAt: null },
      ],
      productionCosts: [{ workOrderId: 10, amount: 5_000_000, sourceTimesheetId: 7, purchaseOrderId: null }],
      timesheets: [{ id: 7, projectId: 1, hours: 40 }],
    }),
  )
}

export function projectPlRow(pl: ReturnType<typeof buildProjectPl>, over: Partial<ProjectPlRow> = {}): ProjectPlRow {
  return {
    ...pl,
    projectDocumentNo: "PRJ-001",
    projectName: "Restorasi Kijang",
    customerName: "Budi",
    vehiclePlate: "B 1234 CD",
    projectStatus: "active",
    ...over,
  }
}
