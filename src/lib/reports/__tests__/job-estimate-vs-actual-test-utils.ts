import { vi } from "vitest"

// Shared Estimasi vs Aktual loader test scaffolding (Sonar duplication
// gate): prisma mock + work-order/invoice fixtures used by the chain suite
// (job-estimate-vs-actual-data) and the sen-precision suite (…-cents).
export function createJobEstimateMocks() {
  const prismaMock = {
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    productionCost: { findMany: vi.fn().mockResolvedValue([]) },
  }
  return { prismaMock, prismaModule: () => ({ prisma: prismaMock }) }
}

export const JOB_ESTIMATE_PERIOD = {
  start: new Date("2026-10-01T00:00:00"),
  end: new Date("2026-10-31T23:59:59"),
}

export function jobEstimateWo(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    documentNo: "WO-0001",
    date: new Date("2026-10-05T00:00:00"),
    status: "completed",
    quotationId: 9,
    projectId: null,
    customer: { name: "Bengkel Jaya" },
    customerVehicle: null,
    quotation: { status: "accepted", grandTotal: 100_000_000 },
    productionOrders: [],
    ...over,
  }
}

export function jobEstimateInv(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    quotationId: 9,
    salesOrderId: null,
    projectId: null,
    status: "posted",
    grandTotal: 40_000_000,
    deletedAt: null,
    ...over,
  }
}
