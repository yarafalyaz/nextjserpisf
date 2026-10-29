/**
 * Tahap 3 komisi (vonis R-komisi-vonispayable §2/§4–§6): akrual benar,
 * idempoten, mapping kosong fail-closed, R≤A, periode terkunci tolak.
 *
 * Mock TxClient ringan (tanpa DB): tiap tes membangun state journal +
 * subledger sendiri. assertPeriodOpen dimock lewat flag periode.
 */

import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  periodLocked: false,
}))

vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn(async () => {
    if (mocks.periodLocked) throw new Error("Periode terkunci.")
  }),
}))

vi.mock("@/lib/hooks/accounting.hook", () => ({
  assertJournalClaimRef: (referenceType: unknown, referenceId: unknown) => {
    if (typeof referenceType !== "string" || referenceType.trim() === "")
      throw new Error("Klaim jurnal ditolak: referenceType wajib non-empty.")
    if (typeof referenceId !== "number" || !Number.isInteger(referenceId) || referenceId <= 0)
      throw new Error("Klaim jurnal ditolak: referenceId wajib integer positif.")
  },
}))

import { accrueTx, paidTx, reverseTx } from "@/lib/services/commission-payable.service"

const D = (n: number) => new Prisma.Decimal(n.toFixed(2))

interface Row {
  id: number
  salesInvoiceId: number
  salesEmployeeId: number
  accruedAmount: Prisma.Decimal
  reversalAmount: Prisma.Decimal
  paidAmount: Prisma.Decimal
  accrualJournalId: number | null
}

/** TxClient palsu: cukup untuk accrue/reverse/paid. */
function makeTx(opts?: {
  invoice?: Record<string, unknown>
  settings?: Record<string, unknown> | null
  accounts?: Array<{ id: number; reportGroup: string | null; isActive: boolean }>
  payable?: Row | null
  journalExists?: boolean
}) {
  const state = {
    payable: (opts?.payable ?? null) as Row | null,
    journals: [] as Array<{ id: number; referenceType: string; referenceId: number; entries: Array<{ accountId: number; debit: unknown; credit: unknown }> }>,
    journalExists: opts?.journalExists ?? false,
    nextJournal: 1,
    nextRow: 1,
  }
  const invoice = {
    id: 1,
    status: "paid",
    salesEmployeeId: 9,
    commissionRatePercent: D(2),
    grandTotal: D(11_000_000),
    taxAmount: D(0),
    documentNo: "INV/1",
    updatedAt: new Date(2026, 9, 15),
    ...(opts?.invoice ?? {}),
  }
  const tx = {
    commissionPayable: {
      findFirst: async () => state.payable,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.payable = {
          id: state.nextRow++,
          salesInvoiceId: data.salesInvoiceId as number,
          salesEmployeeId: data.salesEmployeeId as number,
          accruedAmount: data.accruedAmount as Prisma.Decimal,
          reversalAmount: D(0),
          paidAmount: D(0),
          accrualJournalId: data.accrualJournalId as number,
        }
        return state.payable
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (!state.payable) throw new Error("no row")
        if (data.reversalAmount) state.payable.reversalAmount = data.reversalAmount as Prisma.Decimal
        if (data.paidAmount) state.payable.paidAmount = data.paidAmount as Prisma.Decimal
        return state.payable
      },
    },
    salesInvoice: { findUniqueOrThrow: async () => invoice },
    systemSetting: { findFirst: async () => opts?.settings ?? null },
    account: { findMany: async () => opts?.accounts ?? [] },
    salesReturn: { findUniqueOrThrow: async () => ({ id: 5, date: new Date(2026, 9, 20) }) },
    journal: {
      findFirst: async () => (state.journalExists ? { id: 1 } : null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const j = { id: state.nextJournal++, referenceType: data.referenceType as string, referenceId: data.referenceId as number, entries: [] as Array<{ accountId: number; debit: unknown; credit: unknown }> }
        state.journals.push(j)
        return j
      },
    },
    journalEntry: {
      createMany: async ({ data }: { data: Array<{ accountId: number; debit: unknown; credit: unknown }> }) => {
        state.journals[state.journals.length - 1].entries.push(...data)
        return { count: data.length }
      },
    },
  }
  return { tx: tx as never, state, invoice }
}

const SETTINGS = { commissionExpenseAccountId: 600, commissionPayableAccountId: 210 }
const ACCOUNTS = [
  { id: 600, reportGroup: "EXPS", isActive: true },
  { id: 210, reportGroup: "OCLY", isActive: true },
]

describe("commission-payable accrue", () => {
  beforeEach(() => {
    mocks.periodLocked = false
  })

  it("akrual benar: DPP × persen → Dr 600002-dim / Cr utang satu tx", async () => {
    const { tx, state } = makeTx({ settings: SETTINGS, accounts: ACCOUNTS })
    const out = await accrueTx(tx, 1)
    // DPP 11.000.000 × 2% = 220.000 (bukan 246.400 basis grandTotal).
    expect(out).toEqual({ accrued: true, amount: 220000, reason: null })
    expect(state.payable?.accruedAmount.toNumber()).toBe(220000)
    const j = state.journals[0]
    const dr = j.entries.find((e) => e.accountId === 600)
    const cr = j.entries.find((e) => e.accountId === 210)
    expect(Number(dr?.debit)).toBe(220000)
    expect(Number(cr?.credit)).toBe(220000)
  })

  it("idempoten: baris existing = no-op tanpa jurnal kedua", async () => {
    const { tx, state } = makeTx({
      settings: SETTINGS,
      accounts: ACCOUNTS,
      payable: {
        id: 1, salesInvoiceId: 1, salesEmployeeId: 9,
        accruedAmount: D(220000), reversalAmount: D(0), paidAmount: D(0), accrualJournalId: 7,
      },
    })
    const out = await accrueTx(tx, 1)
    expect(out.accrued).toBe(true)
    expect(state.journals).toHaveLength(0)
  })

  it("mapping kosong fail-closed: nol baris + nol jurnal", async () => {
    const { tx, state } = makeTx({ settings: null, accounts: [] })
    await expect(accrueTx(tx, 1)).rejects.toThrow(/belum dikonfigurasi|belum lengkap/)
    expect(state.payable).toBeNull()
    expect(state.journals).toHaveLength(0)
  })

  it("periode terkunci tolak sebelum tulis", async () => {
    mocks.periodLocked = true
    const { tx, state } = makeTx({ settings: SETTINGS, accounts: ACCOUNTS })
    await expect(accrueTx(tx, 1)).rejects.toThrow(/terkunci/)
    expect(state.payable).toBeNull()
    expect(state.journals).toHaveLength(0)
  })

  it("penjual null / snapshot null / persen nol = nol akrual beralasan", async () => {
    for (const [invoice, reason] of [
      [{ salesEmployeeId: null }, "penjual-null"],
      [{ commissionRatePercent: null }, "snapshot-null"],
      [{ commissionRatePercent: D(0) }, "persen-nol"],
    ] as const) {
      const { tx, state } = makeTx({ settings: SETTINGS, accounts: ACCOUNTS, invoice })
      const out = await accrueTx(tx, 1)
      expect(out).toEqual({ accrued: false, amount: 0, reason })
      expect(state.payable).toBeNull()
    }
  })
})

describe("commission-payable reverse", () => {
  it("lawan melewati A ditolak berisik (R ≤ A)", async () => {
    const { tx } = makeTx({
      settings: SETTINGS,
      accounts: ACCOUNTS,
      payable: {
        id: 1, salesInvoiceId: 1, salesEmployeeId: 9,
        accruedAmount: D(220000), reversalAmount: D(0), paidAmount: D(0), accrualJournalId: 7,
      },
    })
    await expect(reverseTx(tx, 1, 5, 20_000_000)).rejects.toThrow(/melebihi akrual/)
  })

  it("tanpa baris subledger = tak mengurangi siapa pun", async () => {
    const { tx, state } = makeTx({ settings: SETTINGS, accounts: ACCOUNTS, payable: null })
    const out = await reverseTx(tx, 1, 5, 1_000_000)
    expect(out).toEqual({ reversed: 0, reason: "tanpa-barissubledger" })
    expect(state.journals).toHaveLength(0)
  })
})

describe("commission-payable paid", () => {
  it("bayar melebihi sisa ditolak; retur-sesudah-bayar boleh negatif", async () => {
    const mk = (paid: number, reversal: number) =>
      makeTx({
        settings: SETTINGS,
        accounts: ACCOUNTS,
        payable: {
          id: 1, salesInvoiceId: 1, salesEmployeeId: 9,
          accruedAmount: D(220000), reversalAmount: D(reversal), paidAmount: D(paid), accrualJournalId: 7,
        },
      })
    await expect(paidTx(mk(200000, 0).tx, 1, 30000)).rejects.toThrow(/melebihi sisa/)
    // Retur lahir sesudah lunas: saldo negatif tercatat (tanpa clamp).
    const t2 = mk(220000, 100000)
    const out = await paidTx(t2.tx, 1, 100000)
    expect(out.paid).toBe(320000)
  })
})
