import { vi, expect } from "vitest"

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
  invoiceThresholdPercent?: number | null
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
      invoiceThresholdPercent: opts.invoiceThresholdPercent ?? null,
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
    // BLOCKER-1 F-036-S: mock panel snapshot komisi (kategori 1, tarif 2%
    // berlaku sepanjang 2026). Berkas tes boleh timpa per kasur.
    customer: {
      findUnique: mocks.customerFindUnique ?? vi.fn().mockResolvedValue({ customerCategoryId: 1 }),
    },
    customerCommissionRate: {
      findMany: mocks.customerCommissionRateFindMany ?? vi.fn().mockResolvedValue([
        { id: 1, customerCategoryId: 1, commissionPercent: 2, effectiveFrom: new Date(Date.UTC(2026, 0, 1)), effectiveTo: null },
      ]),
    },
    downPayment: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(dp),
      findMany: mocks.downPaymentFindMany ?? vi.fn().mockResolvedValue([]),
      update: mocks.downPaymentUpdate,
    },
    workOrder: { findFirst: vi.fn().mockResolvedValue({ id: 11 }), create: vi.fn() },
    salesOrder: { findFirst: vi.fn().mockResolvedValue({ id: 12 }), create: vi.fn() },
    salesInvoice: {
      findFirst: mocks.salesInvoiceFindFirst ?? ((async () => null) as any),
      create: mocks.salesInvoiceCreate ?? (async () => ({ id: 101, documentNo: "INV-1", date: new Date(Date.UTC(2026, 9, 1)) })),
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
  // Override: hanya MENGGANTI cabang yang pemanggil paksa punya — bedakan
  // dengan basis lama yang selalu meletakkan mock bersama di beberapa cabang
  // (findUniqueOrThrow DP dari `dp`, sistem setting, dsb.). Untuk pola lama
  // (mocks bersama), dasar sudah cukup; override cabang yang eksplisit di
  // pemanggil (mis. salesInvoice.create tanpa date) tetap menang.
  return { ...base, ...overrides }
}


/** Mock `downPayment.findMany`: kembalikan `rows` hanya untuk query status confirmed. */
export function mockConfirmedDps(mocks: { downPaymentFindMany: any }, rows: unknown[]) {
  mocks.downPaymentFindMany.mockImplementation(async (args: any) =>
    args?.where?.status === "confirmed" ? rows : [],
  )
}

export const confirmedDpRow = (docNo: string, amount: number, isoDate: string) => ({
  documentNo: docNo,
  amount,
  paymentDate: new Date(isoDate),
})

export function expectInvoicePaid(mocks: { salesInvoiceUpdate: any }, data: Record<string, unknown>) {
  expect(mocks.salesInvoiceUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining(data) }),
  )
}

export function expectInvoiceNotPaid(mocks: { salesInvoiceUpdate: any }, data: Record<string, unknown>) {
  expect(mocks.salesInvoiceUpdate).not.toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining(data) }),
  )
}

export function expectPaymentNotes(mocks: { salesPaymentCreate: any }, docNo: string) {
  expect(mocks.salesPaymentCreate).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ notes: expect.stringContaining(docNo) }) }),
  )
}

export function expectPaymentData(mocks: { salesPaymentCreate: any }, data: Record<string, unknown>) {
  expect(mocks.salesPaymentCreate).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining(data) }),
  )
}

export function expectCreditCreated(tx: any, data: Record<string, unknown>) {
  expect(tx.customerCredit.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining(data) }),
  )
}

export const existingInvoice = (over: Record<string, unknown> = {}) => ({
  id: 101, documentNo: "INV-1", grandTotal: 1000, paidAmount: 600, paymentStatus: "partial",
  date: new Date(Date.UTC(2026, 9, 1)), commissionRatePercent: null,
  ...over,
})

export function expectDpConfirmed(mocks: { downPaymentUpdate: any }, id: number) {
  expect(mocks.downPaymentUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id },
      data: expect.objectContaining({ status: "confirmed" }),
    }),
  )
}

export function wireInvoice(tx: any, inv: unknown, paymentFindFirstValue: unknown = null) {
  ;(tx.salesInvoice as any).findFirst = vi.fn().mockResolvedValue(inv)
  ;(tx.salesPayment as any).findFirst = vi.fn().mockResolvedValue(paymentFindFirstValue)
  return tx
}

/** Factory `vi.mock` bersama DP (dipanggil di dalam factory berkas tes dengan `mocks` hoisted pemanggil). */
export const dpPrismaFactory = (mocks: any) => ({
  prisma: {
    $transaction: (fn: any) => mocks.transaction(fn),
    $queryRaw: (...a: unknown[]) => mocks.queryRaw(...a),
  },
})
export const dpDocNumberFactory = (mocks: any) => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.generateDocumentNumber(...a),
})
export const dpPeriodLockFactory = (mocks: any) => ({
  assertPeriodOpen: (...a: unknown[]) => mocks.assertPeriodOpen(...a),
})
export const dpNotificationFactory = (mocks: any) => ({
  notificationService: {
    notifyDocumentsReadyBatch: (...a: unknown[]) => mocks.notifyDocumentsReadyBatch(...a),
  },
})
export const dpAccountingFactory = (mocks: any) => ({
  onSalesInvoicePosted: (...a: unknown[]) => mocks.onSalesInvoicePosted(...a),
})
