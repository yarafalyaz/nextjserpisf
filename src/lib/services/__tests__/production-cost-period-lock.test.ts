import { describe, it, expect, vi, beforeEach } from "vitest"

// Regresi HIGH: reversal jurnal ProductionCost lolos gerbang periode terkunci.
// updateProductionCost/deleteProductionCost hanya assertPeriodOpen(new Date())
// di luar tx; jalur reversal di onProductionCostAbsorbed membuat jurnal lawan
// POSTED bertanggal jurnal ASAL (existing.transactionDate) tanpa cek periode.
// Edit/hapus di November atas jurnal Oktober terkunci menulis ulang GL
// periode tertutup. Pola kanonik repo (reverseJournalsByReferenceTx di
// accounting.hook.ts): assertPeriodOpen(tanggal jurnal asal, tx) di dalam tx
// sebelum reversal dibuat.
//
// Tes menjalankan jalur NYATA applyProductionCostDelta →
// stockJournalService.onProductionCostAbsorbed → JournalService.createJournal
// dengan assertPeriodOpen ASLI (tidak di-mock): fake tx menjawab query kunci
// periode (system_settings ... FOR UPDATE) dari state yang bisa diatur.

let docSeq = 0
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: vi.fn().mockResolvedValue({
    inventoryAccountId: 100,
    stockAdjustmentAccountId: 200,
    inventoryAdjustmentAccountId: null,
    cogsAccountId: 300,
    wipAccountId: 400,
    materialExpenseAccountId: 500,
    materialIssueExpenseAccountId: 510,
    purchaseInventoryAccountId: 600,
    purchaseReturnAccountId: 700,
    salesReturnAccountId: 800,
    purchaseShippingAccountId: 620,
    purchaseAdminFeeAccountId: 630,
  }),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn(async () => `JRN-${String(++docSeq).padStart(4, "0")}`),
}))

import { applyProductionCostDelta } from "@/lib/services/production-cost.service"
import { stockJournalService } from "@/lib/services/stock-journal.service"

const WIP = 400
const DAY = 24 * 60 * 60 * 1000
// Jurnal asal 60 hari lalu; kunci periode 30 hari lalu. "Hari ini" (tanggal
// jurnal pengganti + cek luar aksi) selalu terbuka, tanggal asal terkunci.
const ORIGIN_DATE = new Date(Date.now() - 60 * DAY)
const LOCK_DATE = new Date(Date.now() - 30 * DAY)

type FakeEntry = {
  journalId: number
  accountId: number
  debit: number
  credit: number
  memo?: string | null
  costCenterId?: number | null
  profitCenterId?: number | null
}
type FakeJournal = {
  id: number
  journalNumber: string
  transactionDate: Date
  referenceType: string | null
  referenceId: number | null
  description: string | null
  type: string
  status: string
  totalDebit: number
  totalCredit: number
  createdBy: number | null
  deletedAt: Date | null
  entries: FakeEntry[]
}

function createFakeClient() {
  const journals: FakeJournal[] = []
  const orderTotals = new Map<number, number>()
  // null = periode terbuka; Date = terkunci sampai tanggal itu.
  const period = { lockDate: null as Date | null }
  let nextJournalId = 1

  const isActive = (j: FakeJournal) => j.status !== "REVERSED" && j.deletedAt === null

  const client = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?")
      if (sql.includes("system_settings")) {
        return [{ id: 1, period_lock_date: period.lockDate }]
      }
      return []
    },
    account: {
      findMany: async ({ where }: { where: { id: { in: number[] } } }) =>
        where.id.in.map((id) => ({ id, isActive: true, deletedAt: null, _count: { children: 0 } })),
    },
    journal: {
      findFirst: async ({
        where,
      }: {
        where: {
          referenceType?: string
          referenceId?: number
          deletedAt?: null
          status?: string | { not: string }
        }
      }) => {
        const found = journals.find(
          (j) =>
            j.referenceType === where.referenceType &&
            j.referenceId === where.referenceId &&
            (where.deletedAt === undefined || j.deletedAt === null) &&
            (typeof where.status === "string"
              ? j.status === where.status
              : where.status?.not
                ? j.status !== where.status.not
                : true),
        )
        return found ?? null
      },
      create: async ({
        data,
      }: {
        data: Omit<FakeJournal, "id" | "entries" | "deletedAt"> & { deletedAt?: Date | null }
      }) => {
        const journal: FakeJournal = {
          ...data,
          referenceType: data.referenceType ?? null,
          referenceId: data.referenceId ?? null,
          description: data.description ?? null,
          createdBy: data.createdBy ?? null,
          deletedAt: data.deletedAt ?? null,
          id: nextJournalId++,
          entries: [],
        }
        journals.push(journal)
        return journal
      },
      update: async ({ where, data }: { where: { id: number }; data: { status: string } }) => {
        const j = journals.find((x) => x.id === where.id)!
        j.status = data.status
        return j
      },
      delete: async ({ where }: { where: { id: number } }) => {
        const idx = journals.findIndex((x) => x.id === where.id)
        const [removed] = journals.splice(idx, 1)
        return removed
      },
    },
    journalEntry: {
      createMany: async ({ data }: { data: FakeEntry[] }) => {
        for (const e of data) {
          journals.find((j) => j.id === e.journalId)?.entries.push({ ...e })
        }
        return { count: data.length }
      },
      deleteMany: async ({ where }: { where: { journalId: number } }) => {
        const j = journals.find((x) => x.id === where.journalId)
        if (j) j.entries = []
        return { count: 0 }
      },
    },
    productionOrder: {
      findUnique: async ({ where }: { where: { id: number } }) => ({
        id: where.id,
        totalActualCost: orderTotals.get(where.id) ?? 0,
        documentNo: `MO-${where.id}`,
        status: "in_progress",
        workOrderId: 9,
      }),
      update: async ({
        where,
        data,
      }: {
        where: { id: number }
        data: { totalActualCost: number }
      }) => {
        orderTotals.set(where.id, data.totalActualCost)
        return {}
      },
    },
  }

  const activeCostJournals = (referenceId: number) =>
    journals.filter(
      (j) => j.referenceType === "ProductionCost" && j.referenceId === referenceId && isActive(j),
    )
  const reversalJournals = () => journals.filter((j) => j.referenceType === "Journal")
  // Konvensi laporan repo: POSTED + REVERSED dihitung, pasangan reversal net nol.
  const glWipNet = () =>
    journals
      .filter((j) => j.status === "POSTED" || j.status === "REVERSED")
      .flatMap((j) => j.entries)
      .filter((e) => e.accountId === WIP)
      .reduce((s, e) => s + e.debit - e.credit, 0)

  return { client, journals, orderTotals, period, activeCostJournals, reversalJournals, glWipNet }
}

let fake: ReturnType<typeof createFakeClient>

beforeEach(() => {
  docSeq = 0
  fake = createFakeClient()
})

/** Jurnal serapan POSTED Rp1.000 bertanggal ORIGIN_DATE, dibuat saat periode masih terbuka. */
async function seedPostedJournal() {
  const tx = fake.client as never
  await stockJournalService.onProductionCostAbsorbed(tx, 1000, "MO-55", 5, 7, ORIGIN_DATE)
  fake.orderTotals.set(55, 1000)
  expect(fake.activeCostJournals(5)).toHaveLength(1)
  expect(fake.activeCostJournals(5)[0].status).toBe("POSTED")
  expect(fake.activeCostJournals(5)[0].transactionDate).toEqual(ORIGIN_DATE)
}

describe("ProductionCost reversal gerbang periode terkunci (HIGH)", () => {
  it("update berjurnal di periode terkunci ditolak, jurnal reversal TIDAK dibuat", async () => {
    const tx = fake.client as never
    await seedPostedJournal()
    fake.period.lockDate = LOCK_DATE

    // Jalur updateProductionCost: delta +300 (1.000 → 1.300).
    await expect(
      applyProductionCostDelta(55, 300, tx, { userId: 7, costLineId: 5 }),
    ).rejects.toThrow(/Periode akuntansi sudah ditutup/)

    expect(fake.reversalJournals()).toHaveLength(0)
    expect(fake.journals).toHaveLength(1)
    expect(fake.journals[0].status).toBe("POSTED")
    expect(fake.glWipNet()).toBe(1000)
  })

  it("delete berjurnal di periode terkunci ditolak, jurnal reversal TIDAK dibuat", async () => {
    const tx = fake.client as never
    await seedPostedJournal()
    fake.period.lockDate = LOCK_DATE

    // Jalur deleteProductionCost: delta −1.000 (baris dihapus).
    await expect(
      applyProductionCostDelta(55, -1000, tx, { userId: 7, costLineId: 5 }),
    ).rejects.toThrow(/Periode akuntansi sudah ditutup/)

    expect(fake.reversalJournals()).toHaveLength(0)
    expect(fake.journals).toHaveLength(1)
    expect(fake.journals[0].status).toBe("POSTED")
    expect(fake.activeCostJournals(5)).toHaveLength(1)
    expect(fake.glWipNet()).toBe(1000)
  })

  it("periode terbuka: update tetap membuat reversal bertanggal jurnal asal + jurnal kumulatif baru", async () => {
    const tx = fake.client as never
    await seedPostedJournal()
    // Kunci jauh sebelum tanggal asal → periode asal terbuka.
    fake.period.lockDate = new Date(ORIGIN_DATE.getTime() - DAY)

    await applyProductionCostDelta(55, 300, tx, { userId: 7, costLineId: 5 })

    expect(fake.reversalJournals()).toHaveLength(1)
    expect(fake.reversalJournals()[0].status).toBe("POSTED")
    expect(fake.reversalJournals()[0].transactionDate).toEqual(ORIGIN_DATE)
    expect(fake.journals.find((j) => j.referenceType === "ProductionCost")!.status).toBe("REVERSED")
    expect(fake.activeCostJournals(5)).toHaveLength(1)
    expect(fake.activeCostJournals(5)[0].entries[0]).toEqual(
      expect.objectContaining({ accountId: WIP, debit: 1300, credit: 0 }),
    )
    expect(fake.glWipNet()).toBe(1300)
  })

  it("periode terbuka: delete tetap membuat reversal, GL WIP bersih", async () => {
    const tx = fake.client as never
    await seedPostedJournal()
    fake.period.lockDate = new Date(ORIGIN_DATE.getTime() - DAY)

    await applyProductionCostDelta(55, -1000, tx, { userId: 7, costLineId: 5 })

    expect(fake.reversalJournals()).toHaveLength(1)
    expect(fake.activeCostJournals(5)).toHaveLength(0)
    expect(fake.glWipNet()).toBe(0)
  })
})
