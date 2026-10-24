import type { CloseoutQueueJobInput } from "@/lib/reports/workshop-closeout-queue"

// Fixture bersama tes builder antrean + tes kartu (F-2026-10-24-097-S):
// Sonar menandai blok salin-tempel `jobInput` antar kedua berkas tes
// sebagai duplikasi; simpan sekali di sini (pola project-pl-test-fixtures).
export function closeoutJobInput(
  asOf: Date,
  over: Partial<CloseoutQueueJobInput> = {},
): CloseoutQueueJobInput {
  const daysAgo = (days: number) => new Date(asOf.getTime() - days * 86_400_000)
  return {
    kind: "work_order",
    id: 1,
    slug: "wo-1",
    documentNo: "WO-0001",
    status: "completed",
    endDate: daysAgo(40),
    updatedAt: daysAgo(40),
    customerName: "Budi Santoso",
    plateNumber: "B 1234 AA",
    vehicleLabel: "B 1234 AA · Mitsubishi Pajero",
    productName: null,
    workOrderDocumentNo: null,
    workOrderId: null,
    openProductionOrderCount: 0,
    firstOpenProductionOrder: null,
    openMaterialIssueCount: 0,
    firstOpenMaterialIssue: null,
    unpostedCostCount: 0,
    firstUnpostedCostId: null,
    qty: null,
    completedQty: null,
    totalActualCost: null,
    childWipResidualCount: 0,
    firstChildWipResidual: null,
    qcBlocked: false,
    qcDetail: "Inspeksi akhir lolos.",
    periodClosed: false,
    periodLockDate: null,
    manual: {
      purchaseOrderCount: 0,
      purchaseOrdersWithoutBillCount: 0,
      vendorBillCount: 0,
      unpulledTimesheetCount: 0,
      c7Detail: "Tidak ada PO pembelian tertaut.",
      c8Detail: "Tidak ada timesheet belum tertarik.",
    },
    ...over,
  }
}
