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
  siblingClaims?: { id: number }[]
  siblingJournal?: { id: number; journalNumber: string; referenceId: number } | null
  materialIssues?: { items: { qty: number; cost: number }[] }[]
  productionCosts?: { amount: number }[]
  settings?: Record<string, unknown> | null
  existingJournal?: { id: number; journalNumber: string } | null
  attachmentCount?: number
  postSentAttachmentCount?: number
  sentLogAt?: Date | null
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
      findMany: async () =>
        overrides.siblingClaims ?? [{ id: (overrides.claim as { id?: number } | null)?.id ?? 5 }],
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
      findFirst: async ({ where }: { where?: { referenceId?: unknown } }) =>
        where?.referenceId !== null && typeof where?.referenceId === "object"
          ? (overrides.siblingJournal ?? null)
          : (overrides.existingJournal ?? null),
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 77, journalNumber: "JRN-77", ...data }),
    },
    journalEntry: {
      createMany: async ({ data }: { data: FakeEntry[] }) => {
        entries.push(data)
        return { count: data.length }
      },
    },
    transactionAttachment: {
      count: async ({ where }: { where?: { createdAt?: { gt: Date } } }) =>
        where?.createdAt
          ? (overrides.postSentAttachmentCount ?? 0)
          : (overrides.attachmentCount ?? 0),
    },
    activityLog: {
      findFirst: async () =>
        overrides.sentLogAt === undefined
          ? { createdAt: new Date("2026-10-20T00:00:00Z") }
          : overrides.sentLogAt
            ? { createdAt: overrides.sentLogAt }
            : null,
    },
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
  supplierClaimRefNo: "PERSETUJUAN-VENDOR-1",
  supplierClaimNotes: "Catatan staf\n[Resi pengiriman klaim supplier: RESI-1]",
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

  it("TASK-019: klaim kedua atas WO repair yang sama tidak menjurnal ulang — mereferensikan jurnal klaim pertama", async () => {
    const { tx, entries } = makeTx({
      claim: { ...coveredClaim, id: 6 },
      siblingClaims: [{ id: 5 }, { id: 6 }],
      siblingJournal: { id: 9, journalNumber: "JRN-9", referenceId: 5 },
      ...costRows,
    })
    state.tx = tx
    await expect(
      postWarrantyClaimCostJournal({ claimId: 6, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/WO repair #55 sudah dijurnal untuk klaim #5 \(jurnal JRN-9\)/)
    expect(entries).toHaveLength(0)
  })

  it("TASK-019: WO repair sama tanpa jurnal klaim lain → klaim pertama tetap menjurnal satu kali", async () => {
    const { tx, entries } = makeTx({
      claim: { ...coveredClaim, id: 6 },
      siblingClaims: [{ id: 5 }, { id: 6 }],
      siblingJournal: null,
      ...costRows,
    })
    state.tx = tx
    const result = await postWarrantyClaimCostJournal({ claimId: 6, eventDate: new Date("2026-10-21T00:00:00Z") })
    expect(result.amount).toBe(2_750_000)
    expect(entries).toHaveLength(1)
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
    const { tx, entries } = makeTx({ claim: coveredClaim, ...costRows, attachmentCount: 1, postSentAttachmentCount: 1 })
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
      attachmentCount: 1, postSentAttachmentCount: 1,
    })
    state.tx = tx
    await expect(
      postWarrantySupplierRecoveryJournal({ claimId: 5, amount: 900_000, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/hampir pasti/)
    expect(entries).toHaveLength(0)
  })

  it("AC-G5 recovery melebihi biaya klaim → ditolak", async () => {
    const { tx, entries } = makeTx({ claim: coveredClaim, ...costRows, attachmentCount: 1, postSentAttachmentCount: 1 })
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
    ).rejects.toThrow(/lampiran persetujuan vendor sesudah pengiriman belum ada/)
    expect(entries).toHaveLength(0)
  })

  it("E130-1 falsifikasi: accepted hanya foto pra-sent + notes bebas, refNo kosong → DITOLAK nol jurnal", async () => {
    const { tx, entries } = makeTx({
      claim: { ...coveredClaim, supplierClaimRefNo: null, supplierClaimNotes: "Supplier sepertinya setuju" },
      ...costRows,
      attachmentCount: 1,
      postSentAttachmentCount: 0,
    })
    state.tx = tx
    await expect(
      postWarrantySupplierRecoveryJournal({ claimId: 5, amount: 900_000, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/Nomor referensi persetujuan vendor wajib/)
    expect(entries).toHaveLength(0)
  })

  it("E130-1 falsifikasi: refNo ada tetapi hanya lampiran pra-sent → DITOLAK pesan spesifik, nol jurnal", async () => {
    const { tx, entries } = makeTx({
      claim: coveredClaim,
      ...costRows,
      attachmentCount: 1,
      postSentAttachmentCount: 0,
    })
    state.tx = tx
    await expect(
      postWarrantySupplierRecoveryJournal({ claimId: 5, amount: 900_000, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/lampiran persetujuan vendor sesudah pengiriman belum ada/)
    expect(entries).toHaveLength(0)
  })

  it("E130-1: lampiran persetujuan pasca-sent + refNo persetujuan → BERHASIL Dr 110508/Cr 510104 seimbang", async () => {
    const { tx, entries } = makeTx({
      claim: coveredClaim,
      ...costRows,
      attachmentCount: 2,
      postSentAttachmentCount: 1,
    })
    state.tx = tx
    const result = await postWarrantySupplierRecoveryJournal({
      claimId: 5,
      amount: 900_000,
      eventDate: new Date("2026-10-21T00:00:00Z"),
    })
    expect(result.amount).toBe(900_000)
    const debit = entries[0].reduce((s, e) => s + e.debit, 0)
    const credit = entries[0].reduce((s, e) => s + e.credit, 0)
    expect(debit).toBe(credit)
    expect(entries[0]).toEqual([
      expect.objectContaining({ accountId: RECEIVABLE_ID, debit: 900_000, credit: 0 }),
      expect.objectContaining({ accountId: EXPENSE_ID, debit: 0, credit: 900_000 }),
    ])
  })

  it("E130-1: refNo masih sama dengan resi sent → DITOLAK walau lampiran pasca-sent ada", async () => {
    const { tx, entries } = makeTx({
      claim: { ...coveredClaim, supplierClaimRefNo: "resi-1" },
      ...costRows,
      attachmentCount: 2,
      postSentAttachmentCount: 1,
    })
    state.tx = tx
    await expect(
      postWarrantySupplierRecoveryJournal({ claimId: 5, amount: 900_000, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/masih sama dengan nomor resi/)
    expect(entries).toHaveLength(0)
  })

  it("E130-1 fallback: waktu sent tak terbukti, refNo beda resi penanda + lampiran ada → BERHASIL", async () => {
    const { tx, entries } = makeTx({
      claim: coveredClaim,
      ...costRows,
      attachmentCount: 1,
      postSentAttachmentCount: 0,
      sentLogAt: null,
    })
    state.tx = tx
    const result = await postWarrantySupplierRecoveryJournal({
      claimId: 5,
      amount: 900_000,
      eventDate: new Date("2026-10-21T00:00:00Z"),
    })
    expect(result.amount).toBe(900_000)
    expect(entries).toHaveLength(1)
  })

  it("E130-1 fallback: waktu sent dan penanda resi sama-sama tak terbukti → DITOLAK spesifik, nol jurnal", async () => {
    const { tx, entries } = makeTx({
      claim: { ...coveredClaim, supplierClaimNotes: "Catatan bebas tanpa penanda" },
      ...costRows,
      attachmentCount: 1,
      sentLogAt: null,
    })
    state.tx = tx
    await expect(
      postWarrantySupplierRecoveryJournal({ claimId: 5, amount: 900_000, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/belum dapat dibuktikan berbeda dari nomor resi/)
    expect(entries).toHaveLength(0)
  })

  it("fail-closed: mapping 110508 kosong → ditolak, nol jurnal", async () => {
    const { tx, entries } = makeTx({
      claim: coveredClaim,
      ...costRows,
      attachmentCount: 1, postSentAttachmentCount: 1,
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

  it("TASK-019: recovery klaim kedua atas WO repair yang sama tidak mengkredit ulang Beban Garansi", async () => {
    const { tx, entries } = makeTx({
      claim: { ...coveredClaim, id: 6 },
      siblingClaims: [{ id: 5 }, { id: 6 }],
      siblingJournal: { id: 9, journalNumber: "JRN-9", referenceId: 5 },
      ...costRows,
      attachmentCount: 1, postSentAttachmentCount: 1,
    })
    state.tx = tx
    await expect(
      postWarrantySupplierRecoveryJournal({ claimId: 6, amount: 900_000, eventDate: new Date("2026-10-21T00:00:00Z") }),
    ).rejects.toThrow(/WO repair #55 sudah dijurnal untuk klaim #5/)
    expect(entries).toHaveLength(0)
  })

  it("AC-G7 anti-dobel E3: jurnal existing → ditolak", async () => {
    const { tx, entries } = makeTx({
      claim: coveredClaim,
      ...costRows,
      attachmentCount: 1, postSentAttachmentCount: 1,
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
