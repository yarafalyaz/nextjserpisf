import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  INVENTORY_TRANSFER_UNRECEIVED_BUCKET_LABELS,
  INVENTORY_TRANSFER_UNRECEIVED_COLUMN_LABELS,
  INVENTORY_TRANSFER_UNRECEIVED_QUEUE_LIMIT,
  INVENTORY_TRANSFER_UNRECEIVED_STALE_DAYS,
  INVENTORY_TRANSFER_UNRECEIVED_TIER_LABELS,
  INVENTORY_TRANSFER_UNRECEIVED_TITLE,
  INVENTORY_TRANSFER_UNKNOWN_STATUS_LABEL,
  buildInventoryTransferUnreceivedQueue,
  type InventoryTransferUnreceivedInput,
} from "../inventory-transfer-unreceived-queue"
import { IN_TRANSIT_TRANSFER_STATUSES } from "../transfer-in-transit"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getWarehouseScope: vi.fn(),
  transferFindMany: vi.fn(),
  itemFindMany: vi.fn(),
  receiptFindMany: vi.fn(),
  transferUpdate: vi.fn(),
  transferCreate: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))
vi.mock("@/lib/auth/warehouse-scope", () => ({
  getWarehouseScope: (...a: unknown[]) => mocks.getWarehouseScope(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    inventoryTransfer: {
      findMany: (...a: unknown[]) => mocks.transferFindMany(...a),
      update: (...a: unknown[]) => mocks.transferUpdate(...a),
      create: (...a: unknown[]) => mocks.transferCreate(...a),
    },
    inventoryTransferItem: { findMany: (...a: unknown[]) => mocks.itemFindMany(...a) },
    inventoryTransferReceipt: { findMany: (...a: unknown[]) => mocks.receiptFindMany(...a) },
  },
}))

import { getInventoryTransferUnreceivedQueue } from "../inventory-transfer-unreceived-queue-data"

// 2026-10-27 05:00 UTC = 12:00 WIB (hari WIB 27 Okt).
const NOW = new Date("2026-10-27T05:00:00.000Z")
const dayAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function input(
  over: Partial<InventoryTransferUnreceivedInput> = {},
): InventoryTransferUnreceivedInput {
  return {
    transferId: 1,
    slug: "trf-1",
    documentNo: "TRF/2026/001",
    status: "processed",
    date: dayAgo(1),
    sourceWarehouseId: 10,
    sourceWarehouseName: "Gudang A",
    destinationWarehouseId: 20,
    destinationWarehouseName: "Gudang B",
    lines: [{ lineId: 11, itemId: 101, qty: 10, receivedQty: 0 }],
    lastReceiptAt: null,
    ...over,
  }
}

describe("buildInventoryTransferUnreceivedQueue (F-2026-10-27-106-S)", () => {
  it("konstanta putusan Lead Q-ITQ-1/2 verbatim + himpunan existing", () => {
    expect(INVENTORY_TRANSFER_UNRECEIVED_STALE_DAYS).toBe(3)
    expect(INVENTORY_TRANSFER_UNRECEIVED_TITLE).toBe("Transfer Belum Diterima Penuh")
    expect(INVENTORY_TRANSFER_UNRECEIVED_BUCKET_LABELS).toEqual({
      processed: "Belum Diterima",
      partially_received: "Diterima Sebagian",
    })
    expect(INVENTORY_TRANSFER_UNRECEIVED_TIER_LABELS.mengendap).toBe("Mengendap")
    expect(INVENTORY_TRANSFER_UNRECEIVED_COLUMN_LABELS.umurDiJalan).toBe("Umur di Jalan")
    expect(INVENTORY_TRANSFER_UNKNOWN_STATUS_LABEL).toBe("Status Tidak Dikenal")
    expect(IN_TRANSIT_TRANSFER_STATUSES).toEqual(["processed", "partially_received"])
    expect(INVENTORY_TRANSFER_UNRECEIVED_QUEUE_LIMIT).toBe(100)
  })

  it("AC-ITQ-B1: populasi persis processed/partially_received; draft/received/processing/receiving bocor = merah; asing tertanda", () => {
    const q = buildInventoryTransferUnreceivedQueue(
      [
        input({ transferId: 1, status: "processed" }),
        input({ transferId: 2, status: "partially_received", documentNo: "TRF/2026/002" }),
        input({ transferId: 3, status: "draft", documentNo: "TRF/2026/003" }),
        input({ transferId: 4, status: "received", documentNo: "TRF/2026/004" }),
        input({ transferId: 5, status: "processing", documentNo: "TRF/2026/005" }),
        input({ transferId: 6, status: "receiving", documentNo: "TRF/2026/006" }),
        input({ transferId: 7, status: "warisan-asing", documentNo: "TRF/2026/007" }),
      ],
      NOW,
    )
    expect(q.rows.map((r) => r.transferId)).toEqual([1, 2])
    expect(q.totalTransfers).toBe(2)
    expect(q.unknownStatusCount).toBe(1)
    expect(q.unknownStatusRows[0]).toMatchObject({
      transferId: 7,
      status: "warisan-asing",
      statusLabel: "Status Tidak Dikenal",
    })
    // Status asing tidak dihitung ke rekap di jalan.
    const recapTransfers =
      q.recap.processed.mengendap.transferCount +
      q.recap.processed.di_jalan.transferCount +
      q.recap.partially_received.mengendap.transferCount +
      q.recap.partially_received.di_jalan.transferCount
    expect(recapTransfers).toBe(2)
  })

  it("AC-ITQ-B2: umur WIB dari date; ==3 mengendap; updatedAt diabaikan; terima terakhir info saja", () => {
    const base = input({ transferId: 1, date: dayAgo(10), lastReceiptAt: dayAgo(1) })
    const mutated = { ...base, updatedAt: NOW } as InventoryTransferUnreceivedInput
    const a = buildInventoryTransferUnreceivedQueue([base], NOW).rows[0]
    const b = buildInventoryTransferUnreceivedQueue([mutated], NOW).rows[0]
    expect(a.umurDiJalanHari).toBe(10)
    expect(b.umurDiJalanHari).toBe(10)
    expect(a.tingkat).toBe("mengendap")
    expect(a.terimaTerakhirAt).toEqual(dayAgo(1))
    expect(a).not.toHaveProperty("updatedAt")

    const edge = buildInventoryTransferUnreceivedQueue(
      [input({ transferId: 2, date: dayAgo(3) }), input({ transferId: 3, date: dayAgo(2), documentNo: "TRF/2026/003" })],
      NOW,
    )
    const byId = new Map(edge.rows.map((r) => [r.transferId, r]))
    expect(byId.get(2)).toMatchObject({ umurDiJalanHari: 3, tingkat: "mengendap" })
    expect(byId.get(3)).toMatchObject({ umurDiJalanHari: 2, tingkat: "di_jalan" })

    const future = buildInventoryTransferUnreceivedQueue(
      [input({ transferId: 4, date: dayAgo(-2) })],
      NOW,
    ).rows[0]
    expect(future).toMatchObject({ umurDiJalanHari: 0, umurDariMasaDepan: true, tingkat: "di_jalan" })
  })

  it("AC-ITQ-B3: urutan mengendap -> tertua -> documentNo; dua ember terpisah; rekap penuh + terpotong", () => {
    const many: InventoryTransferUnreceivedInput[] = [
      input({ transferId: 9, documentNo: "TRF/2026/009", date: dayAgo(5) }),
      input({ transferId: 3, documentNo: "TRF/2026/003", date: dayAgo(5) }),
      input({ transferId: 7, documentNo: "TRF/2026/007", date: dayAgo(10), status: "partially_received" }),
      input({ transferId: 1, documentNo: "TRF/2026/001", date: dayAgo(1) }),
    ]
    const q = buildInventoryTransferUnreceivedQueue(many, NOW)
    expect(q.rows.map((r) => r.transferId)).toEqual([7, 3, 9, 1])
    expect(q.recap.processed.mengendap.transferCount).toBe(2)
    expect(q.recap.partially_received.mengendap.transferCount).toBe(1)
    expect(q.recap.processed.di_jalan.transferCount).toBe(1)

    const limited = buildInventoryTransferUnreceivedQueue(many, NOW, 3, 2)
    expect(limited.rows).toHaveLength(2)
    expect(limited.terpotong).toBe(true)
    expect(limited.totalTransfers).toBe(4)
    // Rekap tetap populasi penuh walau tampil terpotong.
    expect(limited.recap.processed.mengendap.transferCount).toBe(2)
  })

  it("ember status asing ikut terpotong dengan tanda tersendiri", () => {
    const many = [1, 2, 3].map((id) =>
      input({ transferId: id, documentNo: `TRF/2026/00${id}`, status: "warisan-asing" }),
    )
    const q = buildInventoryTransferUnreceivedQueue(many, NOW, 3, 2)
    expect(q.unknownStatusRows).toHaveLength(2)
    expect(q.unknownStatusCount).toBe(3)
    expect(q.unknownTerpotong).toBe(true)
  })

  it("AC-ITQ-B4: sisa qty-receivedQty terjepit 0; hitungan baris; tanpa baris bersisa tertanda (BR-ITQ-12)", () => {
    const q = buildInventoryTransferUnreceivedQueue(
      [
        input({
          transferId: 1,
          status: "partially_received",
          lines: [
            { lineId: 11, itemId: 101, qty: 10, receivedQty: 4 },
            { lineId: 12, itemId: 102, qty: 5, receivedQty: 5 },
            { lineId: 13, itemId: 103, qty: 5, receivedQty: 9 },
          ],
        }),
        input({
          transferId: 2,
          documentNo: "TRF/2026/002",
          lines: [{ lineId: 21, itemId: 101, qty: 3, receivedQty: 3 }],
        }),
      ],
      NOW,
    )
    const byId = new Map(q.rows.map((r) => [r.transferId, r]))
    expect(byId.get(1)).toMatchObject({ totalBaris: 3, barisBersisa: 1, tanpaBarisBersisa: false })
    expect(byId.get(1)?.barisBersisaLabel).toBe("Baris Bersisa 1 dari 3")
    expect(byId.get(1)?.sisaPerBaris).toEqual([{ lineId: 11, itemId: 101, sisaQty: 6 }])
    expect(byId.get(2)).toMatchObject({ totalBaris: 1, barisBersisa: 0, tanpaBarisBersisa: true })
    expect(byId.get(2)?.flags).toContain("tanpa baris bersisa")
    expect(q.totalBarisBersisa).toBe(1)
  })

  it("AC-ITQ-B4/B5 payload: tanpa nilai uang, Σ qty, nama pemroses/penerima", () => {
    const q = buildInventoryTransferUnreceivedQueue([input({})], NOW)
    const serialized = JSON.stringify(q.rows[0])
    for (const key of [
      "cost", "Cost", "amount", "Amount", "value", "Value", "price", "Price",
      "totalQty", "totalSisa", "sisaTotal", "createdBy", "receivedBy",
      "processedBy", "receiverName", "processorName",
    ]) {
      expect(serialized).not.toContain(`"${key}"`)
    }
    expect(q.rows[0]).not.toHaveProperty("updatedAt")
  })

  it("sumber builder/loader baca-saja: tanpa panggilan aksi tulis / tulis prisma", () => {
    const builderSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/reports/inventory-transfer-unreceived-queue.ts"),
      "utf8",
    )
    const loaderSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/reports/inventory-transfer-unreceived-queue-data.ts"),
      "utf8",
    )
    for (const src of [builderSrc, loaderSrc]) {
      expect(src).not.toMatch(/processInventoryTransfer\s*\(/)
      expect(src).not.toMatch(/receiveInventoryTransfer\s*\(/)
      expect(src).not.toMatch(/closeInventoryTransferShortage\s*\(/)
      expect(src).not.toMatch(/\.update\s*\(|\.create\s*\(|\.delete\s*\(|stockMove/)
    }
    // Builder memakai himpunan existing, bukan himpunan kedua; murni tanpa Prisma.
    expect(builderSrc).toContain("IN_TRANSIT_TRANSFER_STATUSES")
    expect(builderSrc).toContain('from "@/lib/reports/transfer-in-transit"')
    expect(builderSrc).not.toContain("transfer-in-transit-data")
    expect(builderSrc).not.toContain("@/lib/db/prisma")
    // Loader menyaring status terminal dikenal di DB, status asing tetap tertangkap.
    expect(loaderSrc).toContain("KNOWN_NON_TRANSIT_TRANSFER_STATUSES")
    expect(loaderSrc).toContain("notIn")
    // Loader menyaring tujuan sebelum query dan tidak memilih updatedAt/nama aktor.
    expect(loaderSrc).toContain("destinationWarehouseId")
    expect(loaderSrc).not.toMatch(/select: \{[^}]*updatedAt/)
  })
})

describe("getInventoryTransferUnreceivedQueue (loader)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1", roles: ["admin"] })
    mocks.getWarehouseScope.mockResolvedValue({ kind: "all" })
    mocks.transferFindMany.mockResolvedValue([])
    mocks.itemFindMany.mockResolvedValue([])
    mocks.receiptFindMany.mockResolvedValue([])
  })

  function transferRow(over: Record<string, unknown> = {}) {
    return {
      id: 1, slug: "trf-1", documentNo: "TRF/2026/001", status: "processed",
      date: dayAgo(5), sourceWarehouseId: 10, destinationWarehouseId: 20,
      sourceWarehouse: { name: "Gudang A" }, destinationWarehouse: { name: "Gudang B" },
      ...over,
    }
  }

  it("AC-ITQ-B5: tanpa izin menolak sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getInventoryTransferUnreceivedQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_inventory_transfers")
    expect(mocks.transferFindMany).not.toHaveBeenCalled()
    expect(mocks.itemFindMany).not.toHaveBeenCalled()
    expect(mocks.receiptFindMany).not.toHaveBeenCalled()
  })

  it("AC-ITQ-B5: scope none = nol baris tanpa query; assigned menyaring destinationWarehouseId", async () => {
    mocks.getWarehouseScope.mockResolvedValue({ kind: "none" })
    const empty = await getInventoryTransferUnreceivedQueue({ now: NOW })
    expect(empty.rows).toEqual([])
    expect(empty.totalTransfers).toBe(0)
    expect(mocks.transferFindMany).not.toHaveBeenCalled()

    mocks.getWarehouseScope.mockResolvedValue({ kind: "assigned", warehouseIds: [20] })
    mocks.transferFindMany.mockResolvedValue([transferRow()])
    mocks.itemFindMany.mockResolvedValue([
      { id: 11, inventoryTransferId: 1, itemId: 101, qty: 10, receivedQty: 4 },
    ])
    // Terima terakhir = createdAt terbaru (BR-ITQ-02), bukan receivedDate:
    // receipt terbaru menurut createdAt justru backdate (receivedDate lebih lama),
    // sehingga max(receivedDate)=dayAgo(2) akan gagal terhadap ekspektasi dayAgo(1).
    mocks.receiptFindMany.mockResolvedValue([
      { inventoryTransferId: 1, createdAt: dayAgo(3), receivedDate: dayAgo(2) },
      { inventoryTransferId: 1, createdAt: dayAgo(1), receivedDate: dayAgo(5) },
    ])
    const q = await getInventoryTransferUnreceivedQueue({ now: NOW })
    const arg = mocks.transferFindMany.mock.calls.at(-1)![0]
    expect(arg.where.destinationWarehouseId).toEqual({ in: [20] })
    expect(arg.where.status).toEqual({ notIn: ["draft", "processing", "receiving", "received"] })
    expect(mocks.receiptFindMany.mock.calls[0][0].select).toEqual({
      inventoryTransferId: true,
      createdAt: true,
    })
    expect(mocks.receiptFindMany.mock.calls[0][0].select).not.toHaveProperty("receivedDate")
    const selectJson = JSON.stringify(arg.select)
    expect(selectJson).not.toContain("updatedAt")
    expect(selectJson).not.toContain("createdBy")
    expect(selectJson).not.toContain("receivedBy")
    expect(selectJson).not.toContain("cost")
    // Satu query item + satu query receipt massal (anti-N+1).
    expect(mocks.itemFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.itemFindMany.mock.calls[0][0].where).toEqual({ inventoryTransferId: { in: [1] } })
    expect(mocks.receiptFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.receiptFindMany.mock.calls[0][0].where).toEqual({ inventoryTransferId: { in: [1] } })
    expect(mocks.receiptFindMany.mock.calls[0][0].select).not.toHaveProperty("receivedBy")
    expect(q.rows[0]).toMatchObject({ umurDiJalanHari: 5, tingkat: "mengendap", barisBersisa: 1 })
    // createdAt terbaru (dayAgo(1)); max(receivedDate) akan memberi dayAgo(2).
    expect(q.rows[0].terimaTerakhirAt).toEqual(dayAgo(1))
    expect(q.rows[0].terimaTerakhirAt).not.toEqual(dayAgo(2))
    expect(q.rows[0].sisaPerBaris).toEqual([{ lineId: 11, itemId: 101, sisaQty: 6 }])
    // Baca-saja.
    expect(mocks.transferUpdate).not.toHaveBeenCalled()
    expect(mocks.transferCreate).not.toHaveBeenCalled()
  })
})
