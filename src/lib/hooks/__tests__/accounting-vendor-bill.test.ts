import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Prisma } from "@prisma/client"

type TxClient = Prisma.TransactionClient

const mocks = vi.hoisted(() => ({
  systemSettingFindFirst: vi.fn(),
  vendorBillFindUniqueOrThrow: vi.fn(),
  journalFindFirst: vi.fn(),
  goodsReceiptCount: vi.fn(),
  journalCreate: vi.fn(),
  transaction: vi.fn(),
  assertPeriodOpen: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: { findFirst: mocks.systemSettingFindFirst },
    vendorBill: { findUniqueOrThrow: mocks.vendorBillFindUniqueOrThrow },
    journal: { findFirst: mocks.journalFindFirst },
    goodsReceipt: { count: mocks.goodsReceiptCount },
    $transaction: mocks.transaction,
  },
}))

vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: mocks.assertPeriodOpen,
}))

import { onVendorBillPosted } from "@/lib/hooks/accounting.hook"

// Settings with the payable account configured (so the early-return guard
// passes) but no inventory/tax accounts, to exercise the service/expense branch.
const PAYABLE = 900
const EXPENSE = 910

const SERVICE_BILL = {
  id: 1,
  documentNo: "BILL-1",
  date: new Date("2026-06-01"),
  grandTotal: 1_000_000,
  tax: 0,
  purchaseOrderId: null, // no PO -> service/expense branch
}

describe("onVendorBillPosted - service/expense branch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.vendorBillFindUniqueOrThrow.mockResolvedValue(SERVICE_BILL)
    mocks.journalFindFirst.mockResolvedValue(null) // not yet posted
    mocks.goodsReceiptCount.mockResolvedValue(0)
    mocks.assertPeriodOpen.mockResolvedValue(undefined)
    // $transaction invokes its callback with a tx exposing model delegates
    mocks.transaction.mockImplementation(async (cb: (tx: TxClient) => unknown) =>
      cb({
        journal: {
          create: mocks.journalCreate,
          findFirst: mocks.journalFindFirst,
        },
        vendorBill: { findUnique: mocks.vendorBillFindUniqueOrThrow },
      } as unknown as TxClient)
    )
    mocks.journalCreate.mockResolvedValue({ id: 1 })
  })

  it("FAILS CLOSED when purchaseExpenseAccountId is unset (no net-zero AP entry)", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({
      purchasePayableAccountId: PAYABLE,
      purchaseExpenseAccountId: null,
      purchaseInventoryAccountId: null,
      purchaseTaxAccountId: null,
    })

    await expect(onVendorBillPosted(1, 42)).rejects.toThrow(/purchaseExpenseAccountId/)
    // Must NOT have posted a misleading journal.
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("posts Dr Expense / Cr Payable when the expense account is configured", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({
      purchasePayableAccountId: PAYABLE,
      purchaseExpenseAccountId: EXPENSE,
      purchaseInventoryAccountId: null,
      purchaseTaxAccountId: null,
    })

    await onVendorBillPosted(1, 42)

    expect(mocks.journalCreate).toHaveBeenCalledTimes(1)
    const arg = mocks.journalCreate.mock.calls[0][0]
    const entries = arg.data.entries.create as { accountId: number; debit: number; credit: number }[]
    // Dr Expense full amount, Cr Payable full amount (balanced, AP recognised).
    expect(entries).toEqual([
      expect.objectContaining({ accountId: EXPENSE, debit: 1_000_000, credit: 0 }),
      expect.objectContaining({ accountId: PAYABLE, debit: 0, credit: 1_000_000 }),
    ])
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
    expect(totalDebit).toBe(totalCredit)
  })

  it("early-returns (no posting) when payable account is unset", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({
      purchasePayableAccountId: null,
      purchaseExpenseAccountId: EXPENSE,
    })

    await onVendorBillPosted(1, 42)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.vendorBillFindUniqueOrThrow).not.toHaveBeenCalled()
  })

  it("is idempotent: skips when a journal already exists for the bill", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({
      purchasePayableAccountId: PAYABLE,
      purchaseExpenseAccountId: EXPENSE,
    })
    mocks.journalFindFirst.mockResolvedValue({ id: 99 }) // already posted

    await onVendorBillPosted(1, 42)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })
})
