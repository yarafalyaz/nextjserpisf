import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  MATERIAL_REQUEST_DRAFT_COLUMN_LABELS,
  MATERIAL_REQUEST_DRAFT_LEVEL_LABELS,
  MATERIAL_REQUEST_DRAFT_NOTICE_TEXT,
  MATERIAL_REQUEST_DRAFT_OVERDUE_NEEDED_BY_LABEL,
  MATERIAL_REQUEST_DRAFT_STALE_DAYS,
  buildMaterialRequestDraftQueue,
  deriveMaterialRequestDraftAge,
  deriveMaterialRequestNeededByLampau,
  type MaterialRequestDraftInput,
} from "../material-request-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  materialRequestFindMany: vi.fn(),
  userFindMany: vi.fn(),
  requirePermission: vi.fn(),
  getWarehouseScope: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    materialRequest: {
      findMany: (...a: unknown[]) => mocks.materialRequestFindMany(...a),
    },
    user: {
      findMany: (...a: unknown[]) => mocks.userFindMany(...a),
    },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

vi.mock("@/lib/auth/warehouse-scope", () => ({
  getWarehouseScope: (...a: unknown[]) => mocks.getWarehouseScope(...a),
}))

import { getMaterialRequestDraftQueue } from "../material-request-draft-queue-data"

// Kunci select loader persis (daftar-putih BR-MRQ-05) — perbandingan
// sebagai himpunan; urutan tidak menjamin apa pun untuk Prisma.
const LOADER_SELECT_KEYS = [
  "createdAt",
  "createdBy",
  "documentNo",
  "id",
  "items",
  "neededBy",
  "requesterWarehouse",
  "requesterWarehouseId",
  "slug",
  "sourceWarehouse",
  "sourceWarehouseId",
  "status",
  "workOrder",
  "workOrderId",
] as const

// Hari kalender WIB tetap: 2026-10-26 — instan 05:00 WIB.
const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(overrides: Partial<MaterialRequestDraftInput> = {}): MaterialRequestDraftInput {
  return {
    materialRequestId: 1,
    slug: "mr-1",
    documentNo: "MR/2026/001",
    status: "draft",
    requesterWarehouseId: 10,
    requesterWarehouseName: "Gudang Tujuan Uji",
    sourceWarehouseId: 20,
    sourceWarehouseName: "Gudang Sumber Uji",
    workOrderId: 30,
    workOrderDocumentNo: "WO/2026/001",
    neededBy: null,
    createdByName: "Pembuat Uji",
    createdAt: day(-2),
    itemCount: 2,
    totalQty: 7,
    ...overrides,
  }
}

describe("material-request-draft-queue (F-2026-10-26-071-S tahap 1)", () => {
  it("konstanta ambang + kata verbatim putusan Q-MRQ-1/2", () => {
    expect(MATERIAL_REQUEST_DRAFT_STALE_DAYS).toBe(3)
    expect(MATERIAL_REQUEST_DRAFT_LEVEL_LABELS).toEqual({
      mengendap: "Mengendap",
      menunggu: "Menunggu Diajukan",
    })
    expect(MATERIAL_REQUEST_DRAFT_COLUMN_LABELS).toEqual({
      documentNo: "No. Dokumen",
      requesterWarehouse: "Gudang Tujuan",
      sourceWarehouse: "Gudang Sumber",
      workOrder: "Perintah Kerja",
      neededBy: "Dibutuhkan",
      age: "Menunggu",
      createdBy: "Dibuat Oleh",
    })
    expect(MATERIAL_REQUEST_DRAFT_OVERDUE_NEEDED_BY_LABEL).toBe("Lewat Tanggal Dibutuhkan")
    expect(MATERIAL_REQUEST_DRAFT_NOTICE_TEXT).toBe(
      "Daftar ini hanya permintaan material yang masih draft dan belum diajukan. Permintaan draft belum disetujui dan belum memindahkan stok; ajukan, ubah, atau hapus lewat detail permintaan.",
    )
  })

  it("AC-MRQ-B1: diajukan/disetujui/status asing tidak masuk populasi", () => {
    const queue = buildMaterialRequestDraftQueue(
      [
        input({ materialRequestId: 1, status: "diajukan", createdAt: day(-30) }),
        input({ materialRequestId: 2, status: "disetujui", createdAt: day(-30) }),
        input({ materialRequestId: 3, status: "asing-warisan", createdAt: day(-30) }),
        input({ materialRequestId: 4, createdAt: day(-30) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.materialRequestId)).toEqual([4])
    expect(queue.levelCounts).toEqual({ mengendap: 1, menunggu: 0 })
    expect(queue.totalDocuments).toBe(1)
  })

  it("AC-MRQ-B2: batas umur — hari sama 0, tepat 3 mengendap, 2 menunggu", () => {
    expect(deriveMaterialRequestDraftAge(day(0), TODAY)).toEqual({
      umurDraftHari: 0,
      umurDariMasaDepan: false,
    })
    const queue = buildMaterialRequestDraftQueue(
      [
        input({ materialRequestId: 1, createdAt: day(-3) }),
        input({ materialRequestId: 2, createdAt: day(-2) }),
      ],
      NOW,
    )
    expect(queue.rows.find((r) => r.materialRequestId === 1)?.tingkat).toBe("mengendap")
    expect(queue.rows.find((r) => r.materialRequestId === 1)?.tingkatLabel).toBe("Mengendap")
    expect(queue.rows.find((r) => r.materialRequestId === 2)?.tingkat).toBe("menunggu")
    expect(queue.rows.find((r) => r.materialRequestId === 2)?.tingkatLabel).toBe(
      "Menunggu Diajukan",
    )
  })

  it("EC-MRQ-4: createdAt masa depan umur 0 tertanda, bukan negatif", () => {
    expect(deriveMaterialRequestDraftAge(day(3), TODAY)).toEqual({
      umurDraftHari: 0,
      umurDariMasaDepan: true,
    })
  })

  it("AC-MRQ-B3: neededBy null/hari sama tidak tertanda; lampau tertanda tanpa mengubah tingkat", () => {
    expect(deriveMaterialRequestNeededByLampau(null, TODAY)).toBe(false)
    expect(deriveMaterialRequestNeededByLampau(day(0), TODAY)).toBe(false)
    expect(deriveMaterialRequestNeededByLampau(day(-1), TODAY)).toBe(true)
    const queue = buildMaterialRequestDraftQueue(
      [input({ materialRequestId: 1, createdAt: day(-1), neededBy: day(-5) })],
      NOW,
    )
    expect(queue.rows[0].neededByLampau).toBe(true)
    expect(queue.rows[0].neededByLampauLabel).toBe("Lewat Tanggal Dibutuhkan")
    expect(queue.rows[0].tingkat).toBe("menunggu")
  })

  it("urutan: mengendap dulu, lalu umur tertua; seri documentNo asc", () => {
    const queue = buildMaterialRequestDraftQueue(
      [
        input({ materialRequestId: 1, documentNo: "MR/B", createdAt: day(-1) }),
        input({ materialRequestId: 2, documentNo: "MR/C", createdAt: day(-10) }),
        input({ materialRequestId: 3, documentNo: "MR/A", createdAt: day(-20) }),
        input({ materialRequestId: 4, documentNo: "MR/D", createdAt: day(-10) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.materialRequestId)).toEqual([3, 2, 4, 1])
  })

  it("AC-MRQ-B4/B5: Σ qty verbatim + tanpa item qty 0; rekap gudang = baris", () => {
    const queue = buildMaterialRequestDraftQueue(
      [
        input({ materialRequestId: 1, totalQty: 7, itemCount: 2, createdAt: day(-9) }),
        input({
          materialRequestId: 2,
          totalQty: 0,
          itemCount: 0,
          requesterWarehouseId: 11,
          requesterWarehouseName: "Gudang Tujuan Lain",
          createdAt: day(-1),
        }),
        input({ materialRequestId: 3, createdAt: day(-9) }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(3)
    expect(queue.rows.find((r) => r.materialRequestId === 1)?.totalQty).toBe(7)
    expect(queue.rows.find((r) => r.materialRequestId === 2)?.totalQty).toBe(0)
    expect(queue.rows.find((r) => r.materialRequestId === 2)?.itemCount).toBe(0)
    expect(queue.levelCounts).toEqual({ mengendap: 2, menunggu: 1 })
    expect(queue.totalDocuments).toBe(3)
    expect(queue.requesterWarehouseCounts).toEqual([
      {
        warehouseId: 11,
        warehouseName: "Gudang Tujuan Lain",
        levelCounts: { mengendap: 0, menunggu: 1 },
        total: 1,
      },
      {
        warehouseId: 10,
        warehouseName: "Gudang Tujuan Uji",
        levelCounts: { mengendap: 2, menunggu: 0 },
        total: 2,
      },
    ])
    expect(queue.sourceWarehouseCounts).toEqual([
      {
        warehouseId: 20,
        warehouseName: "Gudang Sumber Uji",
        levelCounts: { mengendap: 2, menunggu: 1 },
        total: 3,
      },
    ])
  })

  it("EC-MRQ-2/9: WO/pembuat null tampil apa adanya, tetap terhitung", () => {
    const queue = buildMaterialRequestDraftQueue(
      [input({ workOrderId: null, workOrderDocumentNo: null, createdByName: null })],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].workOrderDocumentNo).toBeNull()
    expect(queue.rows[0].createdByName).toBeNull()
  })
})

describe("getMaterialRequestDraftQueue (loader fail-closed, AC-MRQ-B1/B4/B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1", roles: ["warehouse"] })
    mocks.getWarehouseScope.mockResolvedValue({ kind: "all" })
    mocks.materialRequestFindMany.mockResolvedValue([])
    mocks.userFindMany.mockResolvedValue([])
  })

  it("tanpa izin view_material_requests loader menolak sebelum scope/query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getMaterialRequestDraftQueue({ now: NOW })).rejects.toThrow(
      "Tidak memiliki izin",
    )
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_material_requests")
    expect(mocks.getWarehouseScope).not.toHaveBeenCalled()
    expect(mocks.materialRequestFindMany).not.toHaveBeenCalled()
  })

  it("BR-MRQ-04: scope none jatuh kosong sebelum query (nol baris/nol rekap)", async () => {
    mocks.getWarehouseScope.mockResolvedValue({ kind: "none" })
    const queue = await getMaterialRequestDraftQueue({ now: NOW })
    expect(queue).toEqual({
      rows: [],
      levelCounts: { mengendap: 0, menunggu: 0 },
      requesterWarehouseCounts: [],
      sourceWarehouseCounts: [],
      totalDocuments: 0,
    })
    expect(mocks.materialRequestFindMany).not.toHaveBeenCalled()
  })

  it("scope assigned: where OR kedua sisi scoped; select daftar-putih; nama pembuat massal 1 query", async () => {
    mocks.getWarehouseScope.mockResolvedValue({ kind: "assigned", warehouseIds: [10, 20] })
    mocks.materialRequestFindMany.mockResolvedValue([
      {
        id: 1,
        slug: "mr-1",
        documentNo: "MR/2026/001",
        status: "draft",
        requesterWarehouseId: 10,
        sourceWarehouseId: 20,
        workOrderId: 30,
        neededBy: day(-5),
        createdBy: 99,
        createdAt: day(-10),
        requesterWarehouse: { name: "Gudang Tujuan Uji" },
        sourceWarehouse: { name: "Gudang Sumber Uji" },
        workOrder: { documentNo: "WO/2026/001" },
        items: [{ qty: 3 }, { qty: 4.5 }],
      },
      {
        id: 2,
        slug: null,
        documentNo: "MR/2026/002",
        status: "draft",
        requesterWarehouseId: 20,
        sourceWarehouseId: 99,
        workOrderId: null,
        neededBy: null,
        createdBy: 99,
        createdAt: day(-1),
        requesterWarehouse: { name: "Gudang Sumber Uji" },
        sourceWarehouse: { name: "Gudang Luar Scope" },
        workOrder: null,
        items: [],
      },
    ])
    mocks.userFindMany.mockResolvedValue([{ id: 99, name: "Pembuat Uji" }])

    const queue = await getMaterialRequestDraftQueue({ now: NOW })

    expect(mocks.materialRequestFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.materialRequestFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({
      status: "draft",
      OR: [
        { requesterWarehouseId: { in: [10, 20] } },
        { sourceWarehouseId: { in: [10, 20] } },
      ],
    })
    const selectKeys = Object.keys(arg.select)
    expect([...selectKeys].sort()).toEqual([...LOADER_SELECT_KEYS].sort())
    expect(arg.select.items).toEqual({ select: { qty: true } })
    expect(arg.select.requesterWarehouse).toEqual({ select: { name: true } })
    expect(arg.select.workOrder).toEqual({ select: { documentNo: true } })
    const userArg = mocks.userFindMany.mock.calls[0][0]
    expect([...Object.keys(userArg.select)].sort()).toEqual(["id", "name"])
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1)
    expect(userArg.where).toEqual({ id: { in: [99] } })

    expect(queue.totalDocuments).toBe(2)
    const old = queue.rows.find((r) => r.materialRequestId === 1)!
    expect(old.totalQty).toBe(7.5)
    expect(old.itemCount).toBe(2)
    expect(old.createdByName).toBe("Pembuat Uji")
    expect(old.tingkat).toBe("mengendap")
    expect(old.neededByLampau).toBe(true)
    const recent = queue.rows.find((r) => r.materialRequestId === 2)!
    expect(recent.totalQty).toBe(0)
    expect(recent.workOrderDocumentNo).toBeNull()
    expect(recent.tingkat).toBe("menunggu")
  })

  it("scope all: where hanya status draft tanpa OR", async () => {
    await getMaterialRequestDraftQueue({ now: NOW })
    const arg = mocks.materialRequestFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ status: "draft" })
  })
})
