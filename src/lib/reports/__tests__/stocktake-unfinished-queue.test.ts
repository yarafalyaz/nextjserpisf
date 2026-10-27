import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  STOCKTAKE_UNFINISHED_QUEUE_LIMIT,
  STOCKTAKE_UNFINISHED_STALE_DAYS,
  STOCKTAKE_UNFINISHED_STAGE_LABELS,
  STOCKTAKE_UNFINISHED_TITLE,
  buildStocktakeUnfinishedQueue,
  type StocktakeUnfinishedInput,
} from "../stocktake-unfinished-queue"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getWarehouseScope: vi.fn(),
  sessionFindMany: vi.fn(),
  lineFindMany: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionCreate: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))
vi.mock("@/lib/auth/warehouse-scope", () => ({
  getWarehouseScope: (...a: unknown[]) => mocks.getWarehouseScope(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    stocktakeSession: {
      findMany: (...a: unknown[]) => mocks.sessionFindMany(...a),
      update: (...a: unknown[]) => mocks.sessionUpdate(...a),
      create: (...a: unknown[]) => mocks.sessionCreate(...a),
    },
    stocktakeLine: { findMany: (...a: unknown[]) => mocks.lineFindMany(...a) },
  },
}))

import { getStocktakeUnfinishedQueue } from "../stocktake-unfinished-queue-data"

// Sekarang tetap: 2026-10-27 05:00 UTC = 12:00 WIB (hari WIB 27 Okt).
const NOW = new Date("2026-10-27T05:00:00.000Z")
const dayAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function input(over: Partial<StocktakeUnfinishedInput> = {}): StocktakeUnfinishedInput {
  return {
    sessionId: 1,
    slug: "stk-1",
    documentNo: "STK/2026/001",
    status: "draft",
    warehouseId: 10,
    warehouseCode: "GDG-A",
    warehouseName: "Gudang A",
    date: dayAgo(1),
    createdAt: dayAgo(1),
    snapshotAt: null,
    approvedAt: null,
    lines: [],
    ...over,
  }
}

describe("buildStocktakeUnfinishedQueue (F-2026-10-27-090-S)", () => {
  it("konstanta putusan Lead Q-STQ-1/2 verbatim", () => {
    expect(STOCKTAKE_UNFINISHED_STALE_DAYS).toBe(3)
    expect(STOCKTAKE_UNFINISHED_TITLE).toBe("Sesi Opname Belum Selesai")
    expect(STOCKTAKE_UNFINISHED_STAGE_LABELS).toEqual({
      draft: "Draft",
      counting: "Sedang Dihitung",
      recount: "Hitung Ulang",
      review: "Menunggu Persetujuan",
      approved: "Siap Diposting",
    })
    expect(STOCKTAKE_UNFINISHED_QUEUE_LIMIT).toBe(200)
  })

  it("AC-STQ-B1: populasi persis 5 status; posted bocor = merah; asing ke ember tertanda", () => {
    const q = buildStocktakeUnfinishedQueue(
      [
        input({ sessionId: 1, status: "draft" }),
        input({ sessionId: 2, status: "counting", snapshotAt: dayAgo(1) }),
        input({ sessionId: 3, status: "recount", snapshotAt: dayAgo(1) }),
        input({ sessionId: 4, status: "review", snapshotAt: dayAgo(1) }),
        input({ sessionId: 5, status: "approved", approvedAt: dayAgo(1) }),
        input({ sessionId: 6, status: "posted", approvedAt: dayAgo(1) }),
        input({ sessionId: 7, status: "warisan-asing" }),
      ],
      NOW,
    )
    expect(q.rows.map((r) => r.sessionId)).not.toContain(6)
    expect(q.totalSessions).toBe(6)
    expect(q.unknownCount).toBe(1)
    const unknown = q.rows.find((r) => r.sessionId === 7)!
    expect(unknown.statusTidakDikenal).toBe(true)
    expect(unknown.tahap).toBeNull()
    expect(unknown.tahapLabel).toBe("Status Tidak Dikenal")
    expect(unknown.umurTahapHari).toBeNull()
    // Tidak dihitung ke rekap tahap dikenal.
    expect(q.stageCounts).toEqual({ draft: 1, counting: 1, recount: 1, review: 1, approved: 1 })
  })

  it("AC-STQ-B2: acuan per tahap BR-STQ-03; null tertanda cadangan createdAt; updatedAt diabaikan", () => {
    const q = buildStocktakeUnfinishedQueue(
      [
        input({ sessionId: 1, status: "draft", createdAt: dayAgo(5) }),
        input({ sessionId: 2, status: "counting", createdAt: dayAgo(10), snapshotAt: dayAgo(4) }),
        input({ sessionId: 3, status: "recount", createdAt: dayAgo(10), snapshotAt: dayAgo(4) }),
        input({ sessionId: 4, status: "review", createdAt: dayAgo(10), snapshotAt: dayAgo(2) }),
        input({ sessionId: 5, status: "approved", createdAt: dayAgo(10), snapshotAt: dayAgo(9), approvedAt: dayAgo(3) }),
        input({ sessionId: 6, status: "counting", createdAt: dayAgo(6), snapshotAt: null }),
        input({ sessionId: 7, status: "approved", createdAt: dayAgo(7), approvedAt: null }),
      ],
      NOW,
    )
    const byId = new Map(q.rows.map((r) => [r.sessionId, r]))
    expect(byId.get(1)).toMatchObject({ umurTahapHari: 5, tanpaPenandaTahap: false })
    expect(byId.get(2)).toMatchObject({ umurTahapHari: 4, tanpaPenandaTahap: false })
    expect(byId.get(3)).toMatchObject({ umurTahapHari: 4 })
    expect(byId.get(4)).toMatchObject({ umurTahapHari: 2 })
    expect(byId.get(5)).toMatchObject({ umurTahapHari: 3, tingkat: "mengendap" })
    expect(byId.get(6)).toMatchObject({ umurTahapHari: 6, tanpaPenandaTahap: true })
    expect(byId.get(6)?.acuanTahap).toEqual(dayAgo(6))
    expect(byId.get(7)).toMatchObject({ umurTahapHari: 7, tanpaPenandaTahap: true })
    // updatedAt tidak ada di payload baris.
    for (const row of q.rows) expect(row).not.toHaveProperty("updatedAt")
  })

  it("AC-STQ-B2 mutasi: simpan hitungan (updatedAt bergerak) tidak mengubah umur snapshotAt", () => {
    // Builder tidak menerima updatedAt sama sekali; dua input identik
    // kecuali properti asing updatedAt harus menghasilkan umur sama.
    const base = input({ sessionId: 1, status: "counting", createdAt: dayAgo(10), snapshotAt: dayAgo(4) })
    const mutated = { ...base, updatedAt: NOW } as StocktakeUnfinishedInput
    const a = buildStocktakeUnfinishedQueue([base], NOW).rows[0]
    const b = buildStocktakeUnfinishedQueue([mutated], NOW).rows[0]
    expect(b.umurTahapHari).toBe(a.umurTahapHari)
    expect(b.umurTahapHari).toBe(4)
  })

  it("AC-STQ-B3: urutan mengendap -> umur terbesar -> id naik; rekap populasi penuh; terpotong", () => {
    const many: StocktakeUnfinishedInput[] = [
      input({ sessionId: 9, status: "draft", createdAt: dayAgo(5) }),
      input({ sessionId: 3, status: "draft", createdAt: dayAgo(5) }),
      input({ sessionId: 7, status: "draft", createdAt: dayAgo(10) }),
      input({ sessionId: 1, status: "draft", createdAt: dayAgo(1) }),
    ]
    const q = buildStocktakeUnfinishedQueue(many, NOW)
    expect(q.rows.map((r) => r.sessionId)).toEqual([7, 3, 9, 1])
    expect(q.levelCounts).toEqual({ mengendap: 3, menunggu: 1 })

    const limited = buildStocktakeUnfinishedQueue(many, NOW, STOCKTAKE_UNFINISHED_STALE_DAYS, 2)
    expect(limited.rows).toHaveLength(2)
    expect(limited.terpotong).toBe(true)
    expect(limited.totalSessions).toBe(4)
    expect(limited.stageCounts.draft).toBe(4)
  })

  it("AC-STQ-B4/EC-STQ-7: progres count1=0 terhitung, null belum; needsRecount pola finalizeCounts", () => {
    const q = buildStocktakeUnfinishedQueue(
      [
        input({
          sessionId: 1,
          status: "counting",
          snapshotAt: dayAgo(1),
          lines: [
            { systemQty: 5, count1: 0, count2: null }, // terhitung (0 sah), selisih -> recount
            { systemQty: 5, count1: null, count2: null }, // belum
            { systemQty: 5, count1: 5, count2: null }, // terhitung, bersih
            { systemQty: 5, count1: 4, count2: 5 }, // terhitung, sudah recount
          ],
        }),
        input({ sessionId: 2, status: "draft" }),
      ],
      NOW,
    )
    const byId = new Map(q.rows.map((r) => [r.sessionId, r]))
    expect(byId.get(1)).toMatchObject({ totalBaris: 4, barisTerhitung: 3, barisPerluHitungUlang: 1, tanpaBaris: false })
    expect(byId.get(1)?.progresLabel).toBe("Baris Terhitung 3 dari 4")
    expect(byId.get(2)).toMatchObject({ totalBaris: 0, barisTerhitung: 0, tanpaBaris: true })
    expect(byId.get(2)?.progresLabel).toBe("Baris Terhitung 0 dari 0")
  })

  it("AC-STQ-B4/B5 payload: tanpa qty/variance/nilai/nama pencacah-penyetuju", () => {
    const q = buildStocktakeUnfinishedQueue(
      [input({ sessionId: 1, status: "review", snapshotAt: dayAgo(1), lines: [{ systemQty: 9, count1: 1, count2: null }] })],
      NOW,
    )
    for (const row of q.rows) {
      for (const key of ["systemQty", "count1", "count2", "finalCount", "variance", "unitCost", "totalCost", "countedBy", "approvedBy", "countedByName", "approvedByName", "lines"]) {
        expect(row).not.toHaveProperty(key)
      }
    }
  })
})

describe("getStocktakeUnfinishedQueue (loader)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1", roles: ["admin"] })
    mocks.getWarehouseScope.mockResolvedValue({ kind: "all" })
    mocks.sessionFindMany.mockResolvedValue([])
    mocks.lineFindMany.mockResolvedValue([])
  })

  function sessionRow(over: Record<string, unknown> = {}) {
    return {
      id: 1, slug: "stk-1", documentNo: "STK/2026/001", status: "counting",
      warehouseId: 10, date: dayAgo(2), snapshotAt: dayAgo(4), approvedAt: null,
      createdAt: dayAgo(6), warehouse: { code: "GDG-A", name: "Gudang A" }, ...over,
    }
  }

  it("AC-STQ-B5: tanpa izin menolak sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getStocktakeUnfinishedQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_stock_opname")
    expect(mocks.sessionFindMany).not.toHaveBeenCalled()
    expect(mocks.lineFindMany).not.toHaveBeenCalled()
  })

  it("AC-STQ-B5: scope none = nol baris tanpa query; assigned menyaring warehouseId", async () => {
    mocks.getWarehouseScope.mockResolvedValue({ kind: "none" })
    const empty = await getStocktakeUnfinishedQueue({ now: NOW })
    expect(empty.rows).toEqual([])
    expect(empty.totalSessions).toBe(0)
    expect(mocks.sessionFindMany).not.toHaveBeenCalled()

    mocks.getWarehouseScope.mockResolvedValue({ kind: "assigned", warehouseIds: [10] })
    mocks.sessionFindMany.mockResolvedValue([sessionRow()])
    mocks.lineFindMany.mockResolvedValue([
      { sessionId: 1, systemQty: 5, count1: 0, count2: null },
      { sessionId: 1, systemQty: 5, count1: null, count2: null },
    ])
    const q = await getStocktakeUnfinishedQueue({ now: NOW })
    const arg = mocks.sessionFindMany.mock.calls.at(-1)![0]
    expect(arg.where.warehouseId).toEqual({ in: [10] })
    expect(JSON.stringify(arg.select)).not.toContain("updatedAt")
    expect(JSON.stringify(arg.select)).not.toContain("countedBy")
    expect(JSON.stringify(arg.select)).not.toContain("approvedBy")
    // Satu query baris massal untuk semua sesi (anti-N+1).
    expect(mocks.lineFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.lineFindMany.mock.calls[0][0].where).toEqual({ sessionId: { in: [1] } })
    expect(q.rows[0]).toMatchObject({ umurTahapHari: 4, barisTerhitung: 1, totalBaris: 2 })
    // Baca-saja.
    expect(mocks.sessionUpdate).not.toHaveBeenCalled()
    expect(mocks.sessionCreate).not.toHaveBeenCalled()
  })

  it("AC-STQ-B1 loader: query mengecualikan posted", async () => {
    await getStocktakeUnfinishedQueue({ now: NOW })
    // Dipanggil sekali di test ini (beforeEach kosong) — scope all.
    const arg = mocks.sessionFindMany.mock.calls.at(-1)![0]
    expect(JSON.stringify(arg.where)).toContain("posted")
  })
})
