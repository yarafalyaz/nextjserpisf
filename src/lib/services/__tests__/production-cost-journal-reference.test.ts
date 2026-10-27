import { describe, it, expect, vi, beforeEach } from "vitest"

// Regresi TASK-009: edit/hapus/sync biaya produksi selalu P2002 karena
// onProductionCostAbsorbed menumpuk jurnal aktif kedua atas kunci
// (ProductionCost, costLineId) yang sama (journals_active_reference_unique).
// Tes ini menjalankan jalur NYATA applyProductionCostDelta →
// stockJournalService.onProductionCostAbsorbed → JournalService.createJournal
// (tidak ada mock jurnal), dengan fake Prisma yang menegakkan unik aktif
// persis seperti DB: jurnal aktif kedua se-reference melempar P2002.

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

import {
  applyProductionCostDelta,
  syncReworkCostToOrder,
  syncServicePurchaseOrderCost,
} from "@/lib/services/production-cost.service"

const WIP = 400

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
type FakeCostLine = {
  id: number
  productionOrderId: number | null
  workOrderId?: number | null
  purchaseOrderId?: number | null
  nonconformanceId?: number | null
  category: string
  amount: number
  [k: string]: unknown
}

function p2002(target: string): Error & { code: string } {
  const e = new Error(`Unique constraint failed on the fields: (${target})`) as Error & {
    code: string
  }
  e.code = "P2002"
  return e
}

function createFakeClient() {
  const journals: FakeJournal[] = []
  const lines = new Map<number, FakeCostLine>()
  const orderTotals = new Map<number, number>()
  let nextJournalId = 1
  // Id baris biaya sengaja jauh dari id perintah (55) supaya referensi
  // jurnal yang tertukar ke id perintah langsung terlihat.
  let nextLineId = 101

  const isActive = (j: FakeJournal) => j.status !== "REVERSED" && j.deletedAt === null

  const client = {
    $queryRaw: async () => [],
    account: {
      findMany: async ({ where }: { where: { id: { in: number[] } } }) =>
        where.id.in.map((id) => ({ id })),
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
      create: async ({ data }: { data: Omit<FakeJournal, "id" | "entries" | "deletedAt"> & { deletedAt?: Date | null } }) => {
        if (journals.some((j) => j.journalNumber === data.journalNumber)) {
          throw p2002("journal_number")
        }
        const candidate = { ...data, deletedAt: data.deletedAt ?? null }
        if (
          candidate.status !== "REVERSED" &&
          candidate.deletedAt === null &&
          candidate.referenceType !== null &&
          candidate.referenceId !== null &&
          journals.some(
            (j) =>
              isActive(j) &&
              j.referenceType === candidate.referenceType &&
              j.referenceId === candidate.referenceId,
          )
        ) {
          throw p2002("journals_active_reference_unique")
        }
        const journal: FakeJournal = {
          ...candidate,
          referenceType: candidate.referenceType ?? null,
          referenceId: candidate.referenceId ?? null,
          description: candidate.description ?? null,
          createdBy: candidate.createdBy ?? null,
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
      findMany: async () => [{ id: 55, status: "in_progress" }],
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
    workOrder: {
      findUnique: async () => ({ status: "in_progress" }),
    },
    purchaseOrder: {
      findUnique: async () => ({ isService: true, workOrderId: 9, vendorId: 3 }),
    },
    productionCost: {
      findUnique: async ({
        where,
      }: {
        where: { id?: number; nonconformanceId?: number }
      }) => {
        if (where.id != null) return lines.get(where.id) ?? null
        return [...lines.values()].find((l) => l.nonconformanceId === where.nonconformanceId) ?? null
      },
      findMany: async ({
        where,
      }: {
        where: { purchaseOrderId?: number; category?: string }
      }) =>
        [...lines.values()].filter(
          (l) => l.purchaseOrderId === where.purchaseOrderId && l.category === where.category,
        ),
      create: async ({ data }: { data: Omit<FakeCostLine, "id"> }) => {
        const line = { ...data, id: nextLineId++ } as FakeCostLine
        lines.set(line.id, line)
        return line
      },
      update: async ({ where, data }: { where: { id: number }; data: Partial<FakeCostLine> }) => {
        const line = lines.get(where.id)!
        Object.assign(line, data)
        return line
      },
      delete: async ({ where }: { where: { id: number } }) => {
        const line = lines.get(where.id)!
        lines.delete(where.id)
        return line
      },
    },
  }

  const activeCostJournals = (referenceId: number) =>
    journals.filter(
      (j) =>
        j.referenceType === "ProductionCost" && j.referenceId === referenceId && isActive(j),
    )
  // Konvensi laporan repo: POSTED + REVERSED sama-sama dihitung, sehingga
  // pasangan (asli REVERSED + jurnal lawan) men-net ke nol.
  const glWipNet = () =>
    journals
      .filter((j) => j.status === "POSTED" || j.status === "REVERSED")
      .flatMap((j) => j.entries)
      .filter((e) => e.accountId === WIP)
      .reduce((s, e) => s + e.debit - e.credit, 0)

  return { client, journals, lines, orderTotals, activeCostJournals, glWipNet }
}

let fake: ReturnType<typeof createFakeClient>

beforeEach(() => {
  docSeq = 0
  fake = createFakeClient()
})

describe("ProductionCost journal reference (TASK-009)", () => {
  it("create → update → update → delete: tanpa P2002, tepat satu jurnal aktif kumulatif per baris", async () => {
    const tx = fake.client as never

    // create baris biaya Rp1.000 (jalur createProductionCost)
    await applyProductionCostDelta(55, 1000, tx, { userId: 5, costLineId: 5 })
    expect(fake.activeCostJournals(5)).toHaveLength(1)
    expect(fake.activeCostJournals(5)[0].entries).toEqual([
      expect.objectContaining({ accountId: WIP, debit: 1000, credit: 0 }),
      expect.objectContaining({ accountId: 500, debit: 0, credit: 1000 }),
    ])
    expect(fake.glWipNet()).toBe(1000)

    // edit 1.000 → 1.300 (delta +300): dulu P2002 di baris ini
    await applyProductionCostDelta(55, 300, tx, { userId: 5, costLineId: 5 })
    expect(fake.activeCostJournals(5)).toHaveLength(1)
    expect(fake.activeCostJournals(5)[0].entries[0]).toEqual(
      expect.objectContaining({ accountId: WIP, debit: 1300, credit: 0 }),
    )
    expect(fake.glWipNet()).toBe(1300)
    // Histori lama dipertahankan sebagai REVERSED + jurnal lawan.
    expect(fake.journals.some((j) => j.status === "REVERSED" && j.referenceType === "ProductionCost")).toBe(true)
    expect(fake.journals.some((j) => j.referenceType === "Journal" && j.status === "POSTED")).toBe(true)

    // edit lagi 1.300 → 800 (delta −500)
    await applyProductionCostDelta(55, -500, tx, { userId: 5, costLineId: 5 })
    expect(fake.activeCostJournals(5)).toHaveLength(1)
    expect(fake.activeCostJournals(5)[0].entries[0]).toEqual(
      expect.objectContaining({ accountId: WIP, debit: 800, credit: 0 }),
    )
    expect(fake.glWipNet()).toBe(800)

    // hapus baris (delta −800): jurnal aktif hilang, GL bersih, total order 0
    await applyProductionCostDelta(55, -800, tx, { userId: 5, costLineId: 5 })
    expect(fake.activeCostJournals(5)).toHaveLength(0)
    expect(fake.glWipNet()).toBe(0)
    expect(fake.orderTotals.get(55)).toBe(0)
  })

  it("dua baris biaya pada perintah yang sama tidak saling menabrak", async () => {
    const tx = fake.client as never
    await applyProductionCostDelta(55, 1000, tx, { userId: 5, costLineId: 5 })
    await applyProductionCostDelta(55, 500, tx, { userId: 5, costLineId: 6 })
    await applyProductionCostDelta(55, -200, tx, { userId: 5, costLineId: 6 })

    expect(fake.activeCostJournals(5)).toHaveLength(1)
    expect(fake.activeCostJournals(6)).toHaveLength(1)
    expect(fake.activeCostJournals(6)[0].entries[0]).toEqual(
      expect.objectContaining({ accountId: WIP, debit: 300, credit: 0 }),
    )
    expect(fake.glWipNet()).toBe(1300)
  })

  it("tarikan timesheet agregat kedua pada perintah yang sama tidak P2002", async () => {
    const tx = fake.client as never
    // pullLaborCostFromTimesheets memanggil apply tanpa costLineId (agregat
    // per perintah produksi) — tarikan kedua dulu menabrak kunci yang sama.
    await applyProductionCostDelta(55, 250000, tx, { userId: 5 })
    await applyProductionCostDelta(55, 150000, tx, { userId: 5 })

    expect(fake.activeCostJournals(55)).toHaveLength(1)
    expect(fake.activeCostJournals(55)[0].entries[0]).toEqual(
      expect.objectContaining({ accountId: WIP, debit: 400000, credit: 0 }),
    )
    expect(fake.glWipNet()).toBe(400000)
  })

  it("sync rework create → update → clear: referensi selalu id baris biaya, tanpa P2002", async () => {
    const tx = fake.client as never
    const base = {
      nonconformance: { id: 7, referenceType: "ProductionOrder", referenceId: 55 },
      reworkHours: 3,
      documentNo: "NCR-0007",
      createdBy: 5,
    }

    await syncReworkCostToOrder({ ...base, reworkCost: 150000 }, tx)
    const lineId = [...fake.lines.values()][0].id
    expect(lineId).not.toBe(55)
    expect(fake.journals.filter((j) => j.referenceType === "ProductionCost").every((j) => j.referenceId === lineId)).toBe(true)
    expect(fake.activeCostJournals(lineId)).toHaveLength(1)
    expect(fake.glWipNet()).toBe(150000)

    await syncReworkCostToOrder({ ...base, reworkCost: 200000 }, tx)
    expect(fake.activeCostJournals(lineId)).toHaveLength(1)
    expect(fake.activeCostJournals(lineId)[0].entries[0]).toEqual(
      expect.objectContaining({ accountId: WIP, debit: 200000, credit: 0 }),
    )
    expect(fake.glWipNet()).toBe(200000)

    await syncReworkCostToOrder({ ...base, reworkCost: 0 }, tx)
    expect(fake.activeCostJournals(lineId)).toHaveLength(0)
    expect(fake.glWipNet()).toBe(0)
    expect(fake.lines.size).toBe(0)
  })

  it("sync PO jasa create → update → clear: referensi selalu id baris biaya, tanpa P2002", async () => {
    const tx = fake.client as never
    const input = { purchaseOrderId: 42, amount: 500000, documentNo: "PO-0042", createdBy: 5 }

    await syncServicePurchaseOrderCost(input, tx)
    const lineId = [...fake.lines.values()][0].id
    expect(lineId).not.toBe(55)
    expect(fake.journals.filter((j) => j.referenceType === "ProductionCost").every((j) => j.referenceId === lineId)).toBe(true)
    expect(fake.activeCostJournals(lineId)).toHaveLength(1)
    expect(fake.glWipNet()).toBe(500000)

    await syncServicePurchaseOrderCost({ ...input, amount: 700000 }, tx)
    expect(fake.activeCostJournals(lineId)).toHaveLength(1)
    expect(fake.activeCostJournals(lineId)[0].entries[0]).toEqual(
      expect.objectContaining({ accountId: WIP, debit: 700000, credit: 0 }),
    )
    expect(fake.glWipNet()).toBe(700000)

    await syncServicePurchaseOrderCost({ ...input, amount: 0 }, tx)
    expect(fake.activeCostJournals(lineId)).toHaveLength(0)
    expect(fake.glWipNet()).toBe(0)
    expect(fake.lines.size).toBe(0)
  })
})
