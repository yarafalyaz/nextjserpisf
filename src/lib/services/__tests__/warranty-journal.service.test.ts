import { describe, it, expect, vi, beforeEach } from "vitest"

// F-2026-10-21-021 tahap 3 rute provisi MATI — acceptance BOT 6 subset:
// AC-G2 (invoiceForbidden), AC-G3/G4 (saldo provisi 0 → seluruh biaya 510104),
// AC-G5 (recovery virtually-certain saja), AC-G6 (rejected/luar masa tanpa
// jurnal), AC-G7 (anti-dobel), AC-G8 (periode terkunci), AC-G10 (nol baris
// 210205). JournalService ASLI di atas tx palsu; prisma.$transaction menjalankan
// callback dengan tx yang sama supaya "satu transaksi" teruji bentuknya.

const mocks = vi.hoisted(() => ({ generateDocumentNumber: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
}))

const state = vi.hoisted(() => ({
  tx: null as unknown as Record<string, unknown>,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (cb: (tx: unknown) => unknown) => cb(state.tx),
  },
}))

import {
  assertInvoiceAllowedForWorkOrderBridges,
  findWarrantyRepairInvoiceBlock,
  postWarrantyClaimCostJournal,
  postWarrantySupplierRecoveryJournal,
} from "../warranty-journal.service"

const EXPENSE_ID = 510104
const RECEIVABLE_ID = 110508
const SOURCE_ID = 500

interface FakeEntry { accountId: number; debit: number; credit: number; memo?: string }

function makeTx(overrides: {
  claim?: Record<string, unknown> | null
  materialIssues?: { items: { qty: number; cost: number }[] }[]
  productionCosts?: { amount: number }[]
  settings?: Record<string, unknown> | null
  existingJournal?: { id: number; journalNumber: string } | null
  attachmentCount?: number
  periodLockDate?: Date | null
  invoiceClaim?: { id: number; repairWorkOrderId: number } | null
}) {
  const entries: FakeEntry[][] = []
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ")
      if (sql.includes("system_settings")) {
        return [{ id: 1, period_lock_date: overrides.periodLockDate ?? null }]
      }
      return []
    },
    warrantyClaim: {
      findUnique: async () => overrides.claim ?? null,
      findFirst: async () => overrides.invoiceClaim ?? null,
    },
    materialIssue: { findMany: async () => overrides.materialIssues ?? [] },
    productionCost: { findMany: async () => overrides.productionCosts ?? [] },
    systemSetting: {
      findFirst: async () =>
        overrides.settings === undefined
          ? {
              warrantyExpenseAccountId: EXPENSE_ID,
              supplierClaimReceivableAccountId: RECEIVABLE_ID,
              materialIssueExpenseAccountId: SOURCE_ID,
              materialExpenseAccountId: null,
              cogsAccountId: null,
            }
          : overrides.settings,
    },
    account: {
      findFirst: async ({ where }: { where: { id: number } }) => ({
        id: where.id,
        isActive: true,
        _count: { children: 0 },
      }),
      findMany: async ({ where }: { where: { id: { in: number[] } } }) =>
        where.id.in.map((id: number) => ({ id })),
    },
    journal: {
      findFirst: async () => overrides.existingJournal ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 77, journalNumber: "JRN-77", ...data }),
    },
    journalEntry: {
      createMany: async ({ data }: { data: FakeEntry[] }) => {
        entries.push(data)
        return { count: data.length }
      },
    },
    transactionAttachment: { count: async () => overrides.attachmentCount ?? 0 },
    workOrder: { findMany: async () => [{ id: 55 }] },
    salesOrder: { findUnique: async () => ({ quotationId: 9 }) },
  }
  return { tx, entries }
}

const coveredClaim = {
  id: 5,
  status: "closed",
  decisionBy: 3,
  decisionAt: new Date("2026-10-20T00:00:00Z"),
  repairWorkOrderId: 55,
  supplierClaimStatus: "accepted",
  coverage: { expiresAt: new Date("2027-10-21T00:00:00Z") },
  reportedAt: new Date("2026-10-19T00:00:00Z"),
}

const costRows = {
  materialIssues: [{ items: [{ qty: 2, cost: 1_000_000 }] }],
  productionCosts: [{ amount: 750_000 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  let n = 0
  mocks.generateDocumentNumber.mockImplementation(async () => `JRN-${++n}`)
})

describe("E2 WarrantyClaimCost (rute provisi MATI)", () => {
  it("AC-G4/G3 saldo 0: seluruh biaya 2,75jt Dr 510104 / Cr beban sumber, nol baris provisi", async () => {
    const { tx, entries } = makeTx({ claim: coveredClaim, ...costRows })
    state.tx = tx
    const result = await postWarrantyClaimCostJournal({ claimId: 5, eventDate: new Date("2026-10-21T00:00:00Z") })
    expect(result.amount).toBe(2_750_000)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual([
      expect.objectContaining({ accountId: EXPENSE_ID, debit: 2_750_000, credit: 0 }),
      expect.objectContaining({ accountId: SOURCE_ID, debit: 0, credit: 2_750_000 }),
    ])
    expect(entries[0].some((e) => e.accountId === 210205)).toBe(false)
  })

  it("fail-closed: mapping 510104 kosong → ditolak, nol jurnal (falsifikasi AC-G1 bentuk MATI)", async () => {
    const { tx, entries } = makeTx({
      claim: coveredClaim,
      ...costRows,
      settings: {
        warrantyExpenseAccountId: null,
        supplierClaimReceivableAccountId: RECEIVABLE_ID,
        materialIssueExpenseAccountId: SOURCE_ID,
        materialExpenseAccountId: null,
        cogsAccountId: null,
      },
    })
    state.tx = tx
    await expect(
      postWarrantyClaimCostJournal({ claimId: 5, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/510104/)
    expect(entries).toHaveLength(0)
  })

  it("AC-G7 anti-dobel: jurnal POSTED existing → ditolak pesan jelas", async () => {
    const { tx, entries } = makeTx({
      claim: coveredClaim,
      ...costRows,
      existingJournal: { id: 9, journalNumber: "JRN-9" },
    })
    state.tx = tx
    await expect(
      postWarrantyClaimCostJournal({ claimId: 5, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/sudah diposting/)
    expect(entries).toHaveLength(0)
  })

  it("AC-G8 periode terkunci pada tanggal peristiwa → ditolak, tanggal tidak digeser", async () => {
    const { tx, entries } = makeTx({
      claim: coveredClaim,
      ...costRows,
      periodLockDate: new Date("2026-10-21T00:00:00Z"),
    })
    state.tx = tx
    await expect(
      postWarrantyClaimCostJournal({ claimId: 5, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/ditutup/)
    expect(entries).toHaveLength(0)
  })

  it("AC-G6 klaim rejected → tanpa jurnal garansi", async () => {
    const { tx, entries } = makeTx({ claim: { ...coveredClaim, status: "rejected" }, ...costRows })
    state.tx = tx
    await expect(
      postWarrantyClaimCostJournal({ claimId: 5, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/disetujui/)
    expect(entries).toHaveLength(0)
  })

  it("AC-G6 klaim di luar masa walau approved manual → bukan jalur covered, tanpa jurnal", async () => {
    const { tx, entries } = makeTx({
      claim: { ...coveredClaim, reportedAt: new Date("2028-01-01T00:00:00Z") },
      ...costRows,
    })
    state.tx = tx
    await expect(
      postWarrantyClaimCostJournal({ claimId: 5, eventDate: new Date("2028-01-02T00:00:00Z") }),
    ).rejects.toThrow(/covered/)
    expect(entries).toHaveLength(0)
  })

  it("G4 tanpa WO repair / biaya nol → tanpa jurnal", async () => {
    const noWo = makeTx({ claim: { ...coveredClaim, repairWorkOrderId: null }, ...costRows })
    state.tx = noWo.tx
    await expect(
      postWarrantyClaimCostJournal({ claimId: 5, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/WO repair/)
    expect(noWo.entries).toHaveLength(0)

    const zero = makeTx({ claim: coveredClaim, materialIssues: [], productionCosts: [] })
    state.tx = zero.tx
    await expect(
      postWarrantyClaimCostJournal({ claimId: 5, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/nol/)
    expect(zero.entries).toHaveLength(0)
  })
})

describe("E3 WarrantySupplierRecovery", () => {
  it("AC-G5 virtually-certain 900rb: Dr 110508 / Cr 510104, provisi tidak tersentuh", async () => {
    const { tx, entries } = makeTx({ claim: coveredClaim, ...costRows, attachmentCount: 1 })
    state.tx = tx
    const result = await postWarrantySupplierRecoveryJournal({
      claimId: 5,
      amount: 900_000,
      eventDate: new Date("2026-10-21T00:00:00Z"),
    })
    expect(result.amount).toBe(900_000)
    expect(entries[0]).toEqual([
      expect.objectContaining({ accountId: RECEIVABLE_ID, debit: 900_000, credit: 0 }),
      expect.objectContaining({ accountId: EXPENSE_ID, debit: 0, credit: 900_000 }),
    ])
    expect(entries[0].some((e) => e.accountId === 210205)).toBe(false)
  })

  it("AC-G5 recovery possible (status belum accepted) → tanpa jurnal", async () => {
    const { tx, entries } = makeTx({
      claim: { ...coveredClaim, supplierClaimStatus: "sent" },
      ...costRows,
      attachmentCount: 1,
    })
    state.tx = tx
    await expect(
      postWarrantySupplierRecoveryJournal({ claimId: 5, amount: 900_000, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/hampir pasti/)
    expect(entries).toHaveLength(0)
  })

  it("AC-G5 recovery melebihi biaya klaim → ditolak", async () => {
    const { tx, entries } = makeTx({ claim: coveredClaim, ...costRows, attachmentCount: 1 })
    state.tx = tx
    await expect(
      postWarrantySupplierRecoveryJournal({ claimId: 5, amount: 99_000_000, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/melebihi biaya/)
    expect(entries).toHaveLength(0)
  })

  it("AC-G5 tanpa bukti lampiran supplier → ditolak", async () => {
    const { tx, entries } = makeTx({ claim: coveredClaim, ...costRows, attachmentCount: 0 })
    state.tx = tx
    await expect(
      postWarrantySupplierRecoveryJournal({ claimId: 5, amount: 900_000, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/Bukti/)
    expect(entries).toHaveLength(0)
  })

  it("fail-closed: mapping 110508 kosong → ditolak, nol jurnal", async () => {
    const { tx, entries } = makeTx({
      claim: coveredClaim,
      ...costRows,
      attachmentCount: 1,
      settings: {
        warrantyExpenseAccountId: EXPENSE_ID,
        supplierClaimReceivableAccountId: null,
        materialIssueExpenseAccountId: SOURCE_ID,
        materialExpenseAccountId: null,
        cogsAccountId: null,
      },
    })
    state.tx = tx
    await expect(
      postWarrantySupplierRecoveryJournal({ claimId: 5, amount: 900_000, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/110508/)
    expect(entries).toHaveLength(0)
  })

  it("AC-G7 anti-dobel E3: jurnal existing → ditolak", async () => {
    const { tx, entries } = makeTx({
      claim: coveredClaim,
      ...costRows,
      attachmentCount: 1,
      existingJournal: { id: 9, journalNumber: "JRN-9" },
    })
    state.tx = tx
    await expect(
      postWarrantySupplierRecoveryJournal({ claimId: 5, amount: 900_000, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/sudah diposting/)
    expect(entries).toHaveLength(0)
  })
})

describe("invoiceForbidden server (G5)", () => {
  it("AC-G2 WO repair klaim covered → invoice dilarang", async () => {
    const { tx } = makeTx({ invoiceClaim: { id: 5, repairWorkOrderId: 55 } })
    await expect(
      assertInvoiceAllowedForWorkOrderBridges(tx as never, { quotationId: 9 }),
    ).rejects.toThrow(/dilarang/)
    await expect(findWarrantyRepairInvoiceBlock(tx as never, { projectId: 3 })).resolves.toMatch(/dilarang/)
  })

  it("tanpa klaim covered atas WO → invoice aman (guard mati = hijau palsu dicegah kasus positif di atas)", async () => {
    const { tx } = makeTx({ invoiceClaim: null })
    await expect(findWarrantyRepairInvoiceBlock(tx as never, { quotationId: 9 })).resolves.toBeNull()
    await expect(
      assertInvoiceAllowedForWorkOrderBridges(tx as never, { quotationId: 9 }),
    ).resolves.toBeUndefined()
  })
})
