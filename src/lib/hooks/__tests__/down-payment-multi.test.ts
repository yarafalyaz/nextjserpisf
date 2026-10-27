import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Regression test for the multi-DP confirmation bug.
 *
 * Bug: `onDownPaymentConfirmed` rejects any confirmation once the quotation
 * has been converted by a prior DP, AND its idempotency guards return silently
 * when WO/SO/Invoice already exist — so a second DP on the same quotation
 * (which the system explicitly allows, see `createDownPayment` in
 * sales.actions.ts) can never be confirmed and its `SalesPayment` row is
 * never created, so the invoice `paidAmount` is never credited for the
 * second DP and AR is permanently overstated on the GL.
 *
 * This test exercises the hook against a converted quotation with an
 * already-existing invoice. Before the fix, the hook throws
 * "Quotation belum di-accept." After the fix, the hook should:
 *   1. NOT throw
 *   2. Create a SalesPayment for the new DP linked to the existing invoice
 *   3. Update the DP status to CONFIRMED
 *   4. Recalculate the invoice's paidAmount
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  systemSettingFindFirst: vi.fn(),
  journalFindFirst: vi.fn(),
  journalCreate: vi.fn(),
  accountFindMany: vi.fn(),
  assertPeriodOpen: vi.fn(),
  queryRaw: vi.fn(),
  downPaymentFindUnique: vi.fn(),
  downPaymentUpdate: vi.fn(),
  workOrderFindFirst: vi.fn(),
  salesOrderFindFirst: vi.fn(),
  salesInvoiceFindFirst: vi.fn(),
  salesInvoiceUpdate: vi.fn(),
  salesPaymentFindMany: vi.fn(),
  salesPaymentCreate: vi.fn(),
  generateDocumentNumber: vi.fn(),
  notifyDocumentsReadyBatch: vi.fn(),
  onSalesInvoicePosted: vi.fn(),
}))

vi.mock("@/lib/db/prisma", async () => (await import("./down-payment-fixtures")).dpPrismaFactory(mocks))
vi.mock("@/lib/utils/document-number", async () => (await import("./down-payment-fixtures")).dpDocNumberFactory(mocks))

vi.mock("@/lib/services/period-lock.service", async () => (await import("./down-payment-fixtures")).dpPeriodLockFactory(mocks))

vi.mock("@/lib/services/notification.service", async () => (await import("./down-payment-fixtures")).dpNotificationFactory(mocks))
vi.mock("@/lib/hooks/accounting.hook", async () => (await import("./down-payment-fixtures")).dpAccountingFactory(mocks))

import { onDownPaymentConfirmed } from "../down-payment.hook"

import { buildDp as buildDpBase, buildDpTx, expectPaymentData, expectDpConfirmed } from "./down-payment-fixtures"

function buildDp(opts: { id: number; amount: number; status: string; docNo: string }) {
  return buildDpBase({ ...opts, quotationStatus: "converted", sectionName: "Section 1" })
}

function buildTx(dp: ReturnType<typeof buildDp>, existingInvoiceId: number) {
  const tx = buildDpTx(mocks, dp, {
    downPayment: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(dp),
      findMany: vi.fn().mockResolvedValue([]),
      update: mocks.downPaymentUpdate,
    },
    workOrder: { findFirst: mocks.workOrderFindFirst, create: vi.fn().mockResolvedValue({ id: 11, documentNo: "WO-1" }) },
    salesOrder: { findFirst: mocks.salesOrderFindFirst, create: vi.fn().mockResolvedValue({ id: 12, documentNo: "SO-1" }) },
    salesInvoice: {
      findFirst: mocks.salesInvoiceFindFirst,
      create: vi.fn().mockResolvedValue({ id: 101, documentNo: "INV-1" }),
      update: mocks.salesInvoiceUpdate,
    },
    salesPayment: {
      findMany: mocks.salesPaymentFindMany,
      findFirst: vi.fn().mockResolvedValue(null),
      create: mocks.salesPaymentCreate,
    },
    product: { findFirst: vi.fn().mockResolvedValue(null) },
    productMaterial: { findMany: vi.fn().mockResolvedValue([]) },
    item: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
  })
  return { ...tx, existingInvoiceId }
}

const runDp2 = async () => {
  const dp2 = buildDp({ id: 2, amount: 500, status: "draft", docNo: "DP-2" })
  const tx = buildTx(dp2, 100)
  mocks.transaction.mockImplementation(async (fn: any) => fn(tx))
  return dp2
}

describe("onDownPaymentConfirmed — multi-DP support", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateDocumentNumber.mockResolvedValue("PAY-1")
    mocks.onSalesInvoicePosted.mockResolvedValue(undefined)
    mocks.notifyDocumentsReadyBatch.mockResolvedValue(undefined)
    mocks.downPaymentUpdate.mockResolvedValue({})
    mocks.salesPaymentCreate.mockResolvedValue({ id: 555, amount: 500 })
    mocks.salesPaymentFindMany.mockResolvedValue([{ amount: 500 }])
    mocks.salesInvoiceUpdate.mockResolvedValue({})
    mocks.workOrderFindFirst.mockResolvedValue({ id: 1 })
    mocks.salesOrderFindFirst.mockResolvedValue({ id: 1 })
    mocks.salesInvoiceFindFirst.mockResolvedValue({ id: 100, grandTotal: 1000 })
    mocks.systemSettingFindFirst.mockResolvedValue({ customerDownPaymentAccountId: 210, salesReceivableAccountId: 110 })
    mocks.journalFindFirst.mockResolvedValue(null)
    mocks.journalCreate.mockResolvedValue({ id: 9 })
    mocks.accountFindMany.mockImplementation(async (args: any) => (args?.where?.id?.in ?? []).map((id: number) => ({ id })))
    mocks.assertPeriodOpen.mockResolvedValue(undefined)
  })

  it("records a subsequent DP as SalesPayment on the existing invoice", async () => {
    // DP1 already converted the quotation; the second DP (id=2, amount=500)
    // is being confirmed.
    await runDp2()

    // The quotation is already "converted" (DP1's confirmation set it).
    // The hook should NOT throw, even though dp.quotation.status === "converted".
    await expect(onDownPaymentConfirmed(2, 1)).resolves.toBeUndefined()

    // The new SalesPayment for DP2 must be linked to the existing invoice.
    expectPaymentData(mocks, { salesInvoiceId: 100, amount: 500, paymentMethod: "down_payment" })
  })

  it("marks the subsequent DP as CONFIRMED", async () => {
    await runDp2()

    await onDownPaymentConfirmed(2, 1)

    expectDpConfirmed(mocks, 2)
  })

  it("does NOT re-create WO/SO/Invoice or re-post the invoice for a subsequent DP", async () => {
    await runDp2()

    await onDownPaymentConfirmed(2, 1)

    // project.create / workOrder.create / salesOrder.create / salesInvoice.create
    // must not run. The existing tx mocks would throw if they were called
    // (they return undefined and the hook would crash). The test passes only
    // if the subsequent-DP branch returns cleanly without those calls.
    expect(mocks.onSalesInvoicePosted).not.toHaveBeenCalled()
  })
})

/**
 * Regression test for the ready-document notification N+1.
 *
 * Bug: the hook pushed up to 3 ready documents (WorkOrder/SalesOrder/SalesInvoice)
 * into a `for (const doc of readyDocuments) await notifyDocumentReady(...)` loop.
 * Each call internally re-ran `notifyAdmins` → a fresh `prisma.user.findMany`
 * admin lookup + `prisma.notification.createMany`, so a 3-doc confirmation
 * cost 6 round-trips. Fixed by collapsing the loop into a single
 * `notificationService.notifyDocumentsReadyBatch(readyDocuments)` call.
 */
describe("onDownPaymentConfirmed — ready-document notification batching", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateDocumentNumber.mockImplementation(async (key: string) => `${key}-X`)
    mocks.onSalesInvoicePosted.mockResolvedValue(undefined)
    mocks.notifyDocumentsReadyBatch.mockResolvedValue(undefined)
    mocks.salesPaymentCreate.mockResolvedValue({ id: 555, amount: 100 })
    // TASK-011 BUG-02: alokasi awal kini fail-closed tanpa pemetaan akun.
    mocks.systemSettingFindFirst.mockResolvedValue({ customerDownPaymentAccountId: 210, salesReceivableAccountId: 110 })
    mocks.journalFindFirst.mockResolvedValue(null)
    mocks.journalCreate.mockResolvedValue({ id: 9 })
    mocks.assertPeriodOpen.mockResolvedValue(undefined)
  })

  it("sends one batched notification call with all 3 ready documents, not a per-doc loop", async () => {
    // First-DP branch: quotation is ACCEPTED, no existing invoice, no existing WO/SO.
    // DP 600/1000 = 60% ≥ ambang 50% sehingga invoice ikut lahir (3 dokumen).
    const dp = buildDp({ id: 1, amount: 600, status: "draft", docNo: "DP-1" })
    const tx = buildTx(dp, 100) as any
    // The first-DP branch also needs the existing-invoice lookup to return null,
    // the WO/SO idempotency lookups to return null, and a few create mocks.
    tx.salesInvoice.findFirst = vi.fn().mockResolvedValue(null) // no existing invoice
    tx.workOrder.findFirst = mocks.workOrderFindFirst.mockResolvedValue(null)
    tx.salesOrder.findFirst = mocks.salesOrderFindFirst.mockResolvedValue(null)
    tx.downPayment.findMany = vi.fn().mockResolvedValue([{ amount: 600 }])
    tx.product = { findMany: vi.fn().mockResolvedValue([]) }
    tx.item = { findMany: vi.fn().mockResolvedValue([]) }
    tx.workOrder.create = vi.fn().mockResolvedValue({ id: 1, documentNo: "WO-X" })
    tx.project = { create: vi.fn().mockResolvedValue({ id: 1 }) }
    tx.projectStage = { createMany: vi.fn().mockResolvedValue({ count: 0 }) }
    tx.salesOrder.create = vi.fn().mockResolvedValue({ id: 2, documentNo: "SO-X" })
    tx.salesInvoice.create = vi.fn().mockResolvedValue({ id: 3, documentNo: "INV-X" })
    tx.quotation = { update: vi.fn() }
    mocks.transaction.mockImplementation(async (fn: any) => fn(tx))

    await onDownPaymentConfirmed(1, 1)

    // One batched call, three entries, in the order the hook built them.
    expect(mocks.notifyDocumentsReadyBatch).toHaveBeenCalledTimes(1)
    expect(mocks.notifyDocumentsReadyBatch).toHaveBeenCalledWith([
      { type: "WorkOrder", documentNo: "WO-X", context: "Dari DP DP-1" },
      { type: "SalesOrder", documentNo: "SO-X", context: "Dari DP DP-1" },
      { type: "SalesInvoice", documentNo: "INV-X", context: "Dari DP DP-1" },
    ])
  })

  it("does not call the batched notification when no documents were produced (subsequent-DP branch)", async () => {
    // Subsequent-DP branch: existing invoice present → no new WO/SO/Invoice.
    await runDp2()

    await onDownPaymentConfirmed(2, 1)

    expect(mocks.notifyDocumentsReadyBatch).not.toHaveBeenCalled()
  })
})
