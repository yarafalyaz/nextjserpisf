import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader laporan Persediaan Terkirim Belum Diterima (F-2026-10-22-081-S §7,
 * audit BOT 6 kartu t_01f8b3d4): transfer partially_received WAJIB masuk
 * daftar lewat filter status loader — sisa qty-receivedQty @ carried cost
 * OUT; transfer received tidak tampil. Ekspor registry memakai loader sama
 * (report-registry.ts) sehingga satu tes ini menutup layar + PDF.
 * Kasus wajib MERAH bila "partially_received" dicabut dari
 * IN_TRANSIT_TRANSFER_STATUSES.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    inventoryTransfer: { findMany: vi.fn() },
    stockMove: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadTransferInTransit } from "../transfer-in-transit-data"

const PERIOD = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }

function partialTransfer() {
  return {
    id: 100,
    documentNo: "TRF-100",
    date: new Date(2026, 9, 20),
    sourceWarehouse: { name: "Pusat" },
    destinationWarehouse: { name: "Cabang" },
    items: [{ itemId: 7, qty: 10, receivedQty: 4 }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("loadTransferInTransit — filter status partially_received", () => {
  it("kueri loader meminta status processed + partially_received", async () => {
    mocks.prismaMock.inventoryTransfer.findMany.mockResolvedValue([])
    await loadTransferInTransit(PERIOD)
    const arg = mocks.prismaMock.inventoryTransfer.findMany.mock.calls[0][0]
    expect(arg.where.status.in).toContain("processed")
    expect(arg.where.status.in).toContain("partially_received")
  })

  it("transfer partially_received qty10 received4 -> baris sisa 6 @ carried cost OUT", async () => {
    mocks.prismaMock.inventoryTransfer.findMany.mockResolvedValue([partialTransfer()])
    mocks.prismaMock.stockMove.findMany.mockResolvedValue([
      { referenceId: 100, itemId: 7, qty: 10, cost: 15 },
    ])
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 7, sku: "OLI-1", name: "Oli", unitOfMeasure: "PCS", cost: 99 },
    ])
    const { report } = await loadTransferInTransit(PERIOD)
    expect(report.totals.transfers).toBe(1)
    expect(report.totals.items).toBe(1)
    // 6 sisa x carried cost OUT 15 = 90 (bukan harga master 99, bukan qty penuh).
    expect(report.totals.value).toBe(90)
    expect(report.totals.estimatedLines).toBe(0)
    const dataRow = report.table.rows.find((r) => r.kind === "data")
    expect(dataRow?.kind === "data" && dataRow.cells[1]).toBe("6")
  })

  it("transfer received (tidak dikembalikan kueri status) -> daftar kosong", async () => {
    mocks.prismaMock.inventoryTransfer.findMany.mockResolvedValue([])
    const { report } = await loadTransferInTransit(PERIOD)
    expect(report.totals.transfers).toBe(0)
    expect(report.table.rows.some((r) => r.kind === "data")).toBe(false)
  })
})
