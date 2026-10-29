import { describe, it, expect, vi, beforeEach } from "vitest"
import { onVendorBillPosted } from "@/lib/hooks/accounting.hook"
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
const PAYABLE = 210
const EXPENSE = 620
// 135 = clearing persediaan, 150 = PPN Masukan (satu sumber per berkas).
const CLEARING = 135
const TAX = 150
const PPH_LIABILITY = 411

// Penyalur tx uji: satu definisi, dipakai semua describe (hindari 3 blok identik).
function wireVendorBillTx() {
  mocks.transaction.mockImplementation(async (cb: (tx: TxClient) => unknown) =>
    cb({
      journal: { create: mocks.journalCreate, findFirst: mocks.journalFindFirst },
      vendorBill: { findUnique: mocks.vendorBillFindUniqueOrThrow },
    } as unknown as TxClient)
  )
}

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
    wireVendorBillTx()
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

  it("rejects (no posting) when payable account is unset", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({
      purchasePayableAccountId: null,
      purchaseExpenseAccountId: EXPENSE,
    })

    // Posting tidak boleh diam-diam "berhasil" tanpa membukukan apa pun.
    await expect(onVendorBillPosted(1, 42)).rejects.toThrow("Hutang Usaha")
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

describe("onVendorBillPosted - PPh withholding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.journalFindFirst.mockResolvedValue(null)
    mocks.goodsReceiptCount.mockResolvedValue(0)
    mocks.assertPeriodOpen.mockResolvedValue(undefined)
    mocks.journalCreate.mockResolvedValue({ id: 1 })
    mocks.systemSettingFindFirst.mockResolvedValue({
      purchasePayableAccountId: PAYABLE,
      purchaseExpenseAccountId: EXPENSE,
      purchaseInventoryAccountId: null,
      purchaseTaxAccountId: null,
    })
    wireVendorBillTx()
  })

  it("credits the PPh liability and only the net amount to AP", async () => {
    const bill = {
      ...SERVICE_BILL,
      withholdingAmount: 20_000,
      withholdingType: { name: "PPh 23", liabilityAccountId: PPH_LIABILITY },
    }
    mocks.vendorBillFindUniqueOrThrow.mockResolvedValue(bill)

    await onVendorBillPosted(1, 42)

    const entries = mocks.journalCreate.mock.calls[0][0].data.entries.create as {
      accountId: number
      debit: number
      credit: number
    }[]
    // Vendor is owed the bill total minus the withheld tax, which becomes a tax liability.
    expect(entries).toEqual([
      expect.objectContaining({ accountId: EXPENSE, debit: 1_000_000, credit: 0 }),
      expect.objectContaining({ accountId: PPH_LIABILITY, debit: 0, credit: 20_000 }),
      expect.objectContaining({ accountId: PAYABLE, debit: 0, credit: 980_000 }),
    ])
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
    expect(totalDebit).toBe(totalCredit)
  })

  it("FAILS CLOSED when the withholding type has no liability account", async () => {
    mocks.vendorBillFindUniqueOrThrow.mockResolvedValue({
      ...SERVICE_BILL,
      withholdingAmount: 20_000,
      withholdingType: { name: "PPh 23", liabilityAccountId: null },
    })

    await expect(onVendorBillPosted(1, 42)).rejects.toThrow(/akun Hutang PPh/)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("rejects a withholding larger than the bill total", async () => {
    mocks.vendorBillFindUniqueOrThrow.mockResolvedValue({
      ...SERVICE_BILL,
      withholdingAmount: 2_000_000,
      withholdingType: { name: "PPh 23", liabilityAccountId: PPH_LIABILITY },
    })

    await expect(onVendorBillPosted(1, 42)).rejects.toThrow(/melebihi total keseluruhan/)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("posts the plain AP entry when nothing is withheld", async () => {
    mocks.vendorBillFindUniqueOrThrow.mockResolvedValue({
      ...SERVICE_BILL,
      withholdingAmount: 0,
      withholdingType: null,
    })

    await onVendorBillPosted(1, 42)

    const entries = mocks.journalCreate.mock.calls[0][0].data.entries.create as { accountId: number; credit: number }[]
    expect(entries).toHaveLength(2)
    expect(entries[1]).toMatchObject({ accountId: PAYABLE, credit: 1_000_000 })
  })

  // F-2026-10-24-133-V Putusan 4(3): memo debit L3 menyebut nomor WO,
  // referenceType tetap VendorBill; tanpa penanda memo lama utuh.
  it("memo debit menyebut nomor WO bila notes bertanda L3", async () => {
    mocks.vendorBillFindUniqueOrThrow.mockResolvedValue({
      ...SERVICE_BILL,
      notes: "BIAYA TELAT NON-JOB L3 | WO: WO-0007 | Alasan: jasa bubut telat",
      withholdingAmount: 0,
      withholdingType: null,
    })

    await onVendorBillPosted(1, 42)

    const arg = mocks.journalCreate.mock.calls[0][0]
    expect(arg.data.referenceType).toBe("VendorBill")
    const entries = arg.data.entries.create as { accountId: number; memo: string }[]
    expect(entries[0].memo).toContain("WO-0007")
    expect(entries[0].accountId).toBe(EXPENSE)
  })
})

describe("F-2026-10-28-157-V E157B-4 hook gabung-HPP", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.journalFindFirst.mockResolvedValue(null)
    mocks.goodsReceiptCount.mockResolvedValue(1) // goods-based via PO
    mocks.assertPeriodOpen.mockResolvedValue(undefined)
    mocks.journalCreate.mockResolvedValue({ id: 1 })
    mocks.systemSettingFindFirst.mockResolvedValue({
      purchasePayableAccountId: PAYABLE,
      purchaseExpenseAccountId: EXPENSE,
      purchaseInventoryAccountId: CLEARING,
      purchaseTaxAccountId: TAX,
    })
    wireVendorBillTx()
  })

  function entriesOf() {
    return mocks.journalCreate.mock.calls[0][0].data.entries.create as {
      accountId: number
      debit: number
      credit: number
    }[]
  }

  // Penegak seimbang: debit = kredit di tiap kasus gabung-HPP.
  function expectBalanced() {
    const entries = entriesOf()
    const debit = entries.reduce((s, e) => s + e.debit, 0)
    expect(debit).toBe(entries.reduce((s, e) => s + e.credit, 0))
    return entries
  }

  // E157B-4 dua arah: tanpa nomor valid PPN gabung HPP; bernomor valid
  // kaki PPN Masukan tetap ada. Satu penegak balance dipakai keduanya.
  it.each([
    ["tanpa nomor gabung HPP", null, 1_100_000, 0],
    ["nomor valid pecah PPN", "010.000-26.00000001", 1_000_000, 100_000],
  ])("%s", async (_label, taxNo, clearingDebit, taxDebit) => {
    const bill = {
      id: 1, grandTotal: 1_100_000, tax: 100_000, taxInvoiceNumber: taxNo,
      date: new Date("2026-06-01"), documentNo: "BILL-1", purchaseOrderId: 5,
    }
    mocks.vendorBillFindUniqueOrThrow.mockResolvedValue(bill)

    await onVendorBillPosted(1, 42)

    const entries = expectBalanced()
    expect(entries).toContainEqual(expect.objectContaining({ accountId: CLEARING, debit: clearingDebit, credit: 0 }))
    if (taxDebit > 0) {
      expect(entries).toContainEqual(expect.objectContaining({ accountId: TAX, debit: taxDebit, credit: 0 }))
    } else {
      expect(entries).not.toContainEqual(expect.objectContaining({ accountId: TAX }))
    }
  })
})
