import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * E93-1..7 (vonis BOT 4 PR #563) atas aksi dokumen denda.
 * Tx mock: $transaction menjalankan callback dengan tx berisi model mock;
 * claim idempotency + generateDocumentNumber + period lock di-mock supaya
 * tes fokus kontrak denda, bukan infrastruktur repo existing.
 */

const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(async () => []),
    create: vi.fn(),
    update: vi.fn(async () => ({})),
    createMany: vi.fn(async () => ({ count: 2 })),
  })
  const tx: Record<string, unknown> = {
    salesInvoice: model(),
    customerLateFeeTerm: model(),
    salesLateFee: model(),
    salesLateFeePayment: model(),
    systemSetting: model(),
    account: model(),
    journal: model(),
    journalEntry: model(),
    financialIdempotencyKey: model(),
    $queryRaw: vi.fn(async () => [{ id: 1, period_lock_date: null }]),
  }
  const prismaMock: Record<string, unknown> = {
    ...tx,
    customer: model(),
    $transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  }
  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    tx,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(async () => undefined),
    claimMock: vi.fn(
      async (): Promise<{ replayed: boolean; resultRefType?: string | null; resultRefId?: number | null }> => ({
        replayed: false,
      }),
    ),
    bindMock: vi.fn(async () => undefined),
    docNumberMock: vi.fn(async () => "001/LF/YRA/10/2026"),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...(a as [])),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...(a as [])),
}))
vi.mock("@/lib/services/financial-idempotency.service", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    claimIdempotencyKey: (...a: unknown[]) => mocks.claimMock(...(a as [])),
    bindIdempotencyKey: (...a: unknown[]) => mocks.bindMock(...(a as [])),
  }
})
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.docNumberMock(...(a as [])),
}))
vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { next: () => Promise.resolve(42) },
}));

import * as actions from "../sales-late-fee.actions"

type M = Record<string, ReturnType<typeof vi.fn>>
const tx = mocks.tx as Record<string, M>

function fd(payload: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.set(k, v)
  return f
}

const DUE = new Date(2026, 9, 1)
const invoiceRow = {
  id: 10,
  documentNo: "INV-10",
  customerId: 3,
  status: "posted",
  grandTotal: 10_000_000,
  paidAmount: 4_000_000,
  taxAmount: 1_100_000,
  dueDate: DUE,
  invoiceExchangeItems: [],
}
const termRow = {
  id: 7,
  ratePercentPerDay: 0.1,
  flatAmountPerDay: null,
  capAmount: null,
  effectiveFrom: new Date(2026, 0, 1),
  effectiveTo: null,
}
const issueFd = {
  salesInvoiceId: "10",
  termId: "7",
  date: "2026-10-11",
  idempotencyKey: "latefee-issue-0001",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
  mocks.claimMock.mockResolvedValue({ replayed: false })
  mocks.docNumberMock.mockResolvedValue("001/LF/YRA/10/2026")
  ;(mocks.prismaMock.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (cb: (t: unknown) => unknown) => cb(mocks.tx),
  )
  tx.salesInvoice.findFirst.mockResolvedValue({ ...invoiceRow })
  tx.customerLateFeeTerm.findFirst.mockResolvedValue({ ...termRow })
  tx.salesLateFee.create.mockResolvedValue({ id: 55, documentNo: "001/LF/YRA/10/2026" })
  tx.salesLateFee.findUniqueOrThrow.mockResolvedValue({
    id: 55,
    documentNo: "001/LF/YRA/10/2026",
    salesInvoiceId: 10,
    amount: 60_000,
    date: new Date(2026, 9, 11),
    reversesId: null,
  })
  tx.systemSetting.findFirst.mockResolvedValue({
    id: 1,
    salesReceivableAccountId: 110,
    lateFeeIncomeAccountId: 410,
    cashBankAccountId: 100,
  })
  tx.account.findMany.mockImplementation(async (args: { where: { id: { in: number[] } } }) =>
    args.where.id.in.map((id) => ({ id })),
  )
  tx.journal.findFirst.mockResolvedValue(null)
  tx.journal.create.mockResolvedValue({ id: 900 })
})

describe("issueSalesLateFee (E93-1..5)", () => {
  it("E93-3: jurnal seimbang sen D Piutang / K Pendapatan Denda; snapshot snapshot tarif", async () => {
    const res = await actions.issueSalesLateFee(fd(issueFd))
    expect(res).toEqual({ success: true, id: 55, documentNo: "001/LF/YRA/10/2026" })
    const docArg = tx.salesLateFee.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(docArg.data.amount).toBe(60_000)
    expect(docArg.data.basisAmount).toBe(6_000_000)
    expect(docArg.data.overdueDays).toBe(10)
    expect(docArg.data.ratePercentPerDay).toBe(0.1)
    const jArg = tx.journal.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(jArg.data.totalDebit).toBe(60_000)
    expect(jArg.data.totalCredit).toBe(60_000)
    const eArg = tx.journalEntry.createMany.mock.calls[0][0] as {
      data: Array<{ accountId: number; debit: number; credit: number }>
    }
    expect(eArg.data).toEqual([
      { journalId: 900, accountId: 110, debit: 60_000, credit: 0, memo: "Piutang denda keterlambatan" },
      { journalId: 900, accountId: 410, debit: 0, credit: 60_000, memo: "Pendapatan denda keterlambatan" },
    ])
  })

  it("E93-4: faktur asal TIDAK pernah di-update (snapshot byte-sama)", async () => {
    const before = JSON.stringify(invoiceRow)
    const res = await actions.issueSalesLateFee(fd(issueFd))
    expect(res.success).toBe(true)
    expect(tx.salesInvoice.update).not.toHaveBeenCalled()
    expect(JSON.stringify(invoiceRow)).toBe(before)
  })

  it("E93-1: syarat absen → ditolak, nol dokumen, nol jurnal", async () => {
    tx.customerLateFeeTerm.findFirst.mockResolvedValue(null)
    const res = await actions.issueSalesLateFee(fd(issueFd))
    expect(res.success).toBe(false)
    expect(res.error).toContain("Syarat denda tidak ditemukan")
    expect(tx.salesLateFee.create).not.toHaveBeenCalled()
    expect(tx.journal.create).not.toHaveBeenCalled()
  })

  it("E93-1: syarat efektif sesudah due → ditolak server", async () => {
    tx.customerLateFeeTerm.findFirst.mockResolvedValue({
      ...termRow,
      effectiveFrom: new Date(2026, 9, 5),
    })
    const res = await actions.issueSalesLateFee(fd(issueFd))
    expect(res.success).toBe(false)
    expect(res.error).toContain("sebelum tanggal jatuh tempo")
    expect(tx.salesLateFee.create).not.toHaveBeenCalled()
  })

  it("E93-2: akun pendapatan denda kosong → ditolak, nol jurnal parsial", async () => {
    tx.systemSetting.findFirst.mockResolvedValue({
      id: 1,
      salesReceivableAccountId: 110,
      lateFeeIncomeAccountId: null,
      cashBankAccountId: 100,
    })
    const res = await actions.issueSalesLateFee(fd(issueFd))
    expect(res.success).toBe(false)
    expect(res.error).toContain("Pendapatan Denda belum dikonfigurasi")
    expect(tx.journal.create).not.toHaveBeenCalled()
    expect(tx.journalEntry.createMany).not.toHaveBeenCalled()
  })

  it("E93-5: replay idempoten → satu dokumen, satu jurnal (hasil awal dikembalikan)", async () => {
    mocks.claimMock.mockResolvedValue({
      replayed: true,
      resultRefType: "SalesLateFee",
      resultRefId: 55,
    })
    tx.salesLateFee.findUnique.mockResolvedValue({ id: 55, documentNo: "001/LF/YRA/10/2026" })
    const res = await actions.issueSalesLateFee(fd(issueFd))
    expect(res).toEqual({ success: true, id: 55, documentNo: "001/LF/YRA/10/2026" })
    expect(tx.salesLateFee.create).not.toHaveBeenCalled()
    expect(tx.journal.create).not.toHaveBeenCalled()
  })

  it("tanpa izin create_sales_late_fees → tidak menyentuh DB", async () => {
    mocks.requirePermissionMock.mockRejectedValue(new Error("NEXT_REDIRECT"))
    const res = await actions.issueSalesLateFee(fd(issueFd))
    expect(res.success).toBe(false)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_sales_late_fees")
  })
})

describe("updateSalesLateFeeAmount (E93-6)", () => {
  it("edit nominal posted selalu ditolak", async () => {
    const res = await actions.updateSalesLateFeeAmount(fd({ id: "55", amount: "1" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("tidak bisa diubah")
    expect(tx.salesLateFee.update).not.toHaveBeenCalled()
  })
})

describe("paySalesLateFee (E93-7)", () => {
  it("pembayaran mengurangi saldo dokumen denda saja; faktur asal utuh", async () => {
    tx.salesLateFee.findFirst.mockResolvedValue({
      id: 55,
      documentNo: "001/LF/YRA/10/2026",
      amount: 60_000,
      paidAmount: 0,
      status: "posted",
    })
    tx.salesLateFeePayment.create.mockResolvedValue({ id: 77 })
    tx.salesLateFeePayment.findUniqueOrThrow.mockResolvedValue({
      id: 77,
      amount: 25_000,
      paymentDate: new Date(2026, 9, 12),
      accountId: null,
      salesLateFee: { documentNo: "001/LF/YRA/10/2026" },
    })
    const res = await actions.paySalesLateFee(
      fd({
        salesLateFeeId: "55",
        amount: "25000",
        paymentDate: "2026-10-12",
        paymentMethod: "transfer",
        idempotencyKey: "latefee-pay-00001",
      }),
    )
    expect(res).toEqual({ success: true, id: 77 })
    const upd = tx.salesLateFee.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(upd.data.paidAmount).toBe(25_000)
    expect(upd.data.status).toBe("partial")
    expect(tx.salesInvoice.update).not.toHaveBeenCalled()
    // jurnal kas: D Kas 100 / K Piutang 110 sebesar pembayaran
    const eArg = tx.journalEntry.createMany.mock.calls[0][0] as {
      data: Array<{ accountId: number; debit: number; credit: number }>
    }
    expect(eArg.data[0]).toMatchObject({ accountId: 100, debit: 25_000, credit: 0 })
    expect(eArg.data[1]).toMatchObject({ accountId: 110, debit: 0, credit: 25_000 })
  })

  it("pembayaran melebihi sisa denda → ditolak", async () => {
    tx.salesLateFee.findFirst.mockResolvedValue({
      id: 55,
      documentNo: "X",
      amount: 60_000,
      paidAmount: 50_000,
      status: "partial",
    })
    const res = await actions.paySalesLateFee(
      fd({
        salesLateFeeId: "55",
        amount: "20000",
        paymentMethod: "tunai",
        idempotencyKey: "latefee-pay-00002",
      }),
    )
    expect(res.success).toBe(false)
    expect(res.error).toContain("melebihi sisa")
    expect(tx.salesLateFeePayment.create).not.toHaveBeenCalled()
  })
})

describe("reverseSalesLateFee (E93-6 waiver)", () => {
  it("waiver = dokumen reversal + status asal reversed; tanpa alasan ditolak", async () => {
    const noReason = await actions.reverseSalesLateFee(
      fd({ salesLateFeeId: "55", idempotencyKey: "latefee-rev-00001" }),
    )
    expect(noReason.success).toBe(false)
    expect(noReason.error).toContain("Alasan")

    tx.salesLateFee.findFirst.mockResolvedValue({
      id: 55,
      documentNo: "001/LF/YRA/10/2026",
      salesInvoiceId: 10,
      customerId: 3,
      termId: 7,
      date: new Date(2026, 9, 11),
      dueReferenceDate: DUE,
      overdueDays: 10,
      basisAmount: 6_000_000,
      ratePercentPerDay: 0.1,
      flatAmountPerDay: null,
      capAmount: null,
      amount: 60_000,
      paidAmount: 0,
      status: "posted",
      reversesId: null,
      reversedBy: null,
    })
    tx.journal.findMany.mockResolvedValue([
      {
        id: 900,
        journalNumber: "LF/55/x",
        transactionDate: new Date(2026, 9, 11),
        description: "denda",
        type: "GENERAL",
        status: "POSTED",
        totalDebit: 60_000,
        totalCredit: 60_000,
        entries: [
          { accountId: 110, debit: 60_000, credit: 0, memo: "Piutang denda keterlambatan", costCenterId: null, profitCenterId: null },
          { accountId: 410, debit: 0, credit: 60_000, memo: "Pendapatan denda keterlambatan", costCenterId: null, profitCenterId: null },
        ],
      },
    ])
    tx.journal.findFirst.mockResolvedValue(null)
    tx.salesLateFee.create.mockResolvedValue({ id: 56, documentNo: "002/LF/YRA/10/2026" })
    const res = await actions.reverseSalesLateFee(
      fd({ salesLateFeeId: "55", reason: "Waiver disetujui manajemen", idempotencyKey: "latefee-rev-00001" }),
    )
    expect(res.success).toBe(true)
    const revArg = tx.salesLateFee.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(revArg.data.reversesId).toBe(55)
    expect(revArg.data.status).toBe("reversed")
    const upd = tx.salesLateFee.update.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }
    expect(upd.data.status).toBe("reversed")
    // jurnal reversal dibuat (baris dibalik oleh reverseJournalsByReferenceTx)
    expect(tx.journal.create).toHaveBeenCalled()
  })
})

describe("createCustomerLateFeeTerm (P2a)", () => {
  it("dua basis tarif → ditolak; satu basis → tersimpan bertanggal efektif", async () => {
    const bad = await actions.createCustomerLateFeeTerm(
      fd({ customerId: "3", ratePercentPerDay: "0.1", flatAmountPerDay: "1000", effectiveFrom: "2026-01-01" }),
    )
    expect(bad.success).toBe(false)
    ;(mocks.prismaMock.customer as M).findFirst.mockResolvedValue({ id: 3, name: "PT Uji" })
    tx.customerLateFeeTerm.create.mockResolvedValue({ id: 7 })
    const ok = await actions.createCustomerLateFeeTerm(
      fd({ customerId: "3", ratePercentPerDay: "0.1", effectiveFrom: "2026-01-01" }),
    )
    expect(ok).toEqual({ success: true, id: 7 })
  })
})
