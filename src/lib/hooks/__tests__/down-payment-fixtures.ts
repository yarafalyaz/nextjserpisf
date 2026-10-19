import { vi } from "vitest"

/**
 * Fixture bersama tes `onDownPaymentConfirmed` (down-payment-*.test.ts).
 * Mock modul (`vi.mock`) tetap di tiap berkas tes karena hoisting Vitest;
 * helper ini hanya membangun data DP dan objek `tx` Prisma dari mock yang
 * sudah dibuat berkas pemanggil, supaya bentuk fixture tidak disalin tiga kali.
 */

export interface DpFixtureOptions {
  id: number
  amount: number
  status: string
  docNo: string
  paymentDate?: Date
  quotationStatus?: string
  sectionName?: string
}

export function buildDp(opts: DpFixtureOptions) {
  return {
    id: opts.id,
    documentNo: opts.docNo,
    quotationId: 10,
    amount: opts.amount,
    status: opts.status,
    paymentDate: opts.paymentDate ?? new Date("2026-10-01T00:00:00Z"),
    quotation: {
      id: 10,
      status: opts.quotationStatus ?? "accepted",
      customerId: 99,
      customerVehicleId: null,
      documentNo: "Q-1",
      subtotal: 1000,
      discount: 0,
      tax: 0,
      grandTotal: 1000,
      customer: { id: 99, name: "Cust" },
      customerVehicle: null,
      projectId: null,
      sections: [
        {
          id: 1,
          name: opts.sectionName ?? "S1",
          items: [
            { id: 1, itemId: 1, description: "Item", qty: 1, unitPrice: 1000, discount: 0, total: 1000 },
          ],
        },
      ],
    },
  }
}

export type DpFixture = ReturnType<typeof buildDp>

/**
 * Objek `tx` dasar untuk hook DP. `overrides` mengganti cabang model yang
 * memang berbeda antar berkas tes (mis. findFirst WO/SO dari mock bersama vs
 * `vi.fn()` lokal); sisanya identik.
 */
export function buildDpTx(mocks: Record<string, any>, dp: DpFixture, overrides: Record<string, any> = {}) {
  const base: Record<string, any> = {
    $queryRaw: vi.fn().mockResolvedValue(undefined),
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    downPayment: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(dp),
      findMany: mocks.downPaymentFindMany ?? vi.fn().mockResolvedValue([]),
      update: mocks.downPaymentUpdate,
    },
    workOrder: { findFirst: vi.fn().mockResolvedValue({ id: 11 }), create: vi.fn() },
    salesOrder: { findFirst: vi.fn().mockResolvedValue({ id: 12 }), create: vi.fn() },
    salesInvoice: {
      findFirst: mocks.salesInvoiceFindFirst ?? vi.fn(),
      create: mocks.salesInvoiceCreate ?? vi.fn(),
      update: mocks.salesInvoiceUpdate ?? vi.fn(),
    },
    salesPayment: {
      findMany: mocks.salesPaymentFindMany ?? vi.fn().mockResolvedValue([]),
      findFirst: mocks.salesPaymentFindFirst ?? vi.fn().mockResolvedValue(null),
      create: mocks.salesPaymentCreate,
    },
    systemSetting: { findFirst: mocks.systemSettingFindFirst ?? vi.fn() },
    journal: {
      findFirst: mocks.journalFindFirst ?? vi.fn().mockResolvedValue(null),
      create: mocks.journalCreate ?? vi.fn(),
    },
    account: { findMany: mocks.accountFindMany ?? vi.fn().mockResolvedValue([]) },
    customerCredit: {
      create: vi.fn().mockResolvedValue({ id: 777, documentNo: "CC-1" }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    item: { findMany: vi.fn().mockResolvedValue([]) },
    workOrderItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    project: { create: vi.fn().mockResolvedValue({ id: 21 }) },
    projectStage: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    salesOrderItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    salesInvoiceItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    quotation: { update: vi.fn() },
    quotationHistory: { create: vi.fn() },
  }
  return { ...base, ...overrides }
}
