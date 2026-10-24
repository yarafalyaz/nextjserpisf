import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

const D = (n: number) => new Prisma.Decimal(n)

// ---- In-memory store: state bertahan antar-panggilan dalam satu tes,
// supaya posting peristiwa ke-2 benar-benar membaca jurnal peristiwa ke-1
// lewat jalur service (bukan builder murni).
interface JEntry { accountId: number; debit: Prisma.Decimal; credit: Prisma.Decimal; memo?: string | null }
interface JRow { id: number; referenceType: string | null; referenceId: number | null; status: string; deletedAt: Date | null; totalDebit: Prisma.Decimal; totalCredit: Prisma.Decimal; entries: JEntry[] }
interface ERow { id: number; assetId: number; kind: string; status: string; effectiveDate: Date; journalId: number | null; [k: string]: unknown }

const store = vi.hoisted(() => ({
  journals: [] as JRow[],
  events: [] as ERow[],
  nextJournalId: 501,
  nextEventId: 101,
  seq: 0,
  assetUpdates: [] as Record<string, unknown>[],
}))

const ACCOUNTS: Record<number, { id: number; code: string; type: string; reportGroup: string | null; isActive: boolean }> = {
  11: { id: 11, code: "120001", type: "ASSET", reportGroup: "FASS", isActive: true },
  12: { id: 12, code: "120002", type: "ASSET", reportGroup: "DEPR", isActive: true },
  13: { id: 13, code: "300004", type: "EQUITY", reportGroup: "EQTY", isActive: true },
  14: { id: 14, code: "600027", type: "EXPENSE", reportGroup: "EXPS", isActive: true },
  15: { id: 15, code: "120007", type: "ASSET", reportGroup: "DEPR", isActive: true },
}

const CATEGORY = {
  id: 1, name: "Mesin", assetAccountId: 11, accumulatedDepreciationAccountId: 12,
  revaluationSurplusAccountId: 13, impairmentLossAccountId: 14, accumulatedImpairmentAccountId: 15,
  taxGroupCode: null,
}

vi.mock("@/lib/db/prisma", () => {
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: 1, period_lock_date: null }]),
    asset: {
      findUnique: vi.fn(async () => ({
        id: 1, name: "Mesin A", code: "AST-1", status: "active", categoryId: 1,
        depreciationMethod: "straight_line", residualValue: D(0), usefulLifeMonths: 60,
        category: CATEGORY,
      })),
      findUniqueOrThrow: vi.fn(async () => ({ status: "active" })),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => { store.assetUpdates.push(args.data); return {} }),
    },
    assetCategory: { findUnique: vi.fn(async () => CATEGORY) },
    account: {
      findFirst: vi.fn(async (args: { where: { id: number } }) => ACCOUNTS[args.where.id] ?? null),
    },
    systemSetting: { findFirst: vi.fn(async () => null) },
    documentSequence: {
      upsert: vi.fn(async () => ({ currentValue: ++store.seq })),
    },
    journal: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        const w = args.where as { id?: { in: number[] }; referenceId?: number }
        let rows = store.journals.filter((j) => j.status === "POSTED" && j.deletedAt == null)
        if (w.id?.in) rows = rows.filter((j) => w.id!.in.includes(j.id))
        else if (w.referenceId != null) rows = rows.filter((j) => j.referenceId === w.referenceId)
        return rows.map((j) => ({ referenceType: j.referenceType, entries: j.entries }))
      }),
      findUnique: vi.fn(async (args: { where: { id: number } }) => {
        const j = store.journals.find((x) => x.id === args.where.id)
        return j ? { ...j } : null
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> & { entries: { create: JEntry[] } } }) => {
        const row: JRow = {
          id: store.nextJournalId++,
          referenceType: args.data.referenceType as string,
          referenceId: args.data.referenceId as number,
          status: "POSTED", deletedAt: null,
          totalDebit: args.data.totalDebit as Prisma.Decimal,
          totalCredit: args.data.totalCredit as Prisma.Decimal,
          entries: args.data.entries.create,
        }
        store.journals.push(row)
        return { id: row.id }
      }),
      update: vi.fn(async (args: { where: { id: number }; data: { status: string } }) => {
        const j = store.journals.find((x) => x.id === args.where.id)
        if (j) j.status = args.data.status
        return {}
      }),
    },
    assetChangeEvent: {
      findUnique: vi.fn(async (args: { where: { sourceDocumentKey?: string; id?: number } }) => {
        if (args.where.id != null) {
          const e = store.events.find((x) => x.id === args.where.id)
          return e ? { ...e, asset: { name: "Mesin A", code: "AST-1", categoryId: 1 } } : null
        }
        return store.events.find((x) => x.sourceDocumentKey === args.where.sourceDocumentKey) ?? null
      }),
      findMany: vi.fn(async (args: { where: { assetId: number; status: string } }) =>
        store.events.filter((e) => e.assetId === args.where.assetId && e.status === args.where.status)),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const row = { id: store.nextEventId++, status: "POSTED", ...args.data } as ERow
        store.events.push(row)
        return { id: row.id }
      }),
      update: vi.fn(async (args: { where: { id: number }; data: { status: string } }) => {
        const e = store.events.find((x) => x.id === args.where.id)
        if (e) e.status = args.data.status
        return {}
      }),
    },
  }
  return { prisma: { $transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)) } }
})

import { postAssetChangeEvent, reverseAssetChangeEvent } from "@/lib/services/asset-change-event.service"

function seedAcquisition() {
  store.journals.push({
    id: 1, referenceType: "ASSET_ACQUISITION", referenceId: 1, status: "POSTED", deletedAt: null,
    totalDebit: D(1000), totalCredit: D(1000),
    entries: [{ accountId: 11, debit: D(1000), credit: D(0) }],
  })
}

beforeEach(() => {
  store.journals = []
  store.events = []
  store.nextJournalId = 501
  store.nextEventId = 101
  store.seq = 0
  store.assetUpdates = []
  seedAcquisition()
})

const impairmentReq = (key: string, recoverable: number) => ({
  kind: "IMPAIRMENT" as const,
  effectiveDate: new Date("2026-02-01"),
  sourceDocumentKey: key,
  impairmentIndicator: "PHYSICAL_DAMAGE",
  recoverableBasis: "VALUE_IN_USE",
  recoverableAmount: recoverable,
})

describe("asset-change-event.service", () => {
  it("E111-S1: peristiwa ke-2 membaca jurnal peristiwa ke-1 lewat join journalId", async () => {
    const first = await postAssetChangeEvent({ assetId: 1, request: impairmentReq("DOC-1", 700) })
    expect(first.journalId).not.toBeNull()
    // Jurnal peristiwa menunjuk aset (patokan pembaca per-aset).
    const j1 = store.journals.find((j) => j.id === first.journalId)
    expect(j1?.referenceType).toBe("ASSET_CHANGE_EVENT")
    expect(j1?.referenceId).toBe(1)

    const second = await postAssetChangeEvent({ assetId: 1, request: impairmentReq("DOC-2", 500) })
    const e2 = store.events.find((e) => e.id === second.eventId)
    // Sesudah impairment pertama 300: tercatat 700, kontra terbaca 300.
    // Jalur lama (referenceId=id peristiwa) menghasilkan 1000/0 di sini.
    expect((e2?.carryingBefore as Prisma.Decimal).toString()).toBe("700")
    expect((e2?.accumulatedImpairmentBefore as Prisma.Decimal).toString()).toBe("300")
    const j2 = store.journals.find((j) => j.id === second.journalId)
    const contraCredit = j2?.entries.filter((e) => e.accountId === 15).reduce((s, e) => s.add(e.credit), D(0))
    expect(contraCredit?.toString()).toBe("200")
  })

  it("E111-S2: reversal mirror snapshot asal (surplus kembali ke sebelum asal, akun tujuan dibalik)", async () => {
    const up = await postAssetChangeEvent({
      assetId: 1,
      request: {
        kind: "REVALUATION_UP",
        effectiveDate: new Date("2026-02-01"),
        sourceDocumentKey: "APR-1",
        fairValue: 1300,
        appraiserName: "KJPP Test",
        appraiserReportRef: "LAP-1",
        revaluedClassName: "Mesin",
      },
    })
    const original = store.events.find((e) => e.id === up.eventId)
    expect((original?.revaluationSurplusBefore as Prisma.Decimal).toString()).toBe("0")
    expect((original?.revaluationSurplusAfter as Prisma.Decimal).toString()).toBe("300")

    const rev = await reverseAssetChangeEvent({
      eventId: up.eventId,
      reversalDate: new Date("2026-03-01"),
      sourceDocumentKey: "REV-1",
    })
    const reversal = store.events.find((e) => e.id === rev.eventId)
    expect(reversal?.reversesEventId).toBe(up.eventId)
    expect((reversal?.revaluationSurplusAfter as Prisma.Decimal).toString()).toBe("0")
    expect((reversal?.revaluationSurplusBefore as Prisma.Decimal).toString()).toBe("300")
    expect((reversal?.carryingAfter as Prisma.Decimal).toString()).toBe(
      (original?.carryingBefore as Prisma.Decimal).toString(),
    )
    // Snapshot akun disalin dari asal; jurnal lawan menunjuk aset + entri dibalik.
    expect(reversal?.surplusAccountId).toBe(original?.surplusAccountId)
    expect(reversal?.fixedAssetAccountId).toBe(original?.fixedAssetAccountId)
    const rj = store.journals.find((j) => j.id === rev.journalId)
    expect(rj?.referenceId).toBe(1)
    const oj = store.journals.find((j) => j.id === up.journalId)
    expect(oj?.status).toBe("REVERSED")
    expect(
      rj?.entries.map((e) => `${e.accountId}:${e.debit}/${e.credit}`).sort(),
    ).toEqual(
      oj?.entries.map((e) => `${e.accountId}:${e.credit}/${e.debit}`).sort(),
    )
    expect(store.events.find((e) => e.id === up.eventId)?.status).toBe("REVERSED")
  })
})
