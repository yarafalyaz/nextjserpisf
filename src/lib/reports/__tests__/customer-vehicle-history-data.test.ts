import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader linimasa kendaraan (F-2026-10-20-15).
 *
 * Yang dijaga: invoice terkumpul dari 4 jembatan (FK kendaraan langsung,
 * quotation, sales order, project/WO) lalu dedup per id — tanpa dedup satu
 * invoice tampil dua kali. Jembatan kosong dilewati (bukan `in: []`), dan
 * linimasa terurut tanggal desc deterministik.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    quotation: { findMany: vi.fn().mockResolvedValue([]) },
    salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    project: { findMany: vi.fn().mockResolvedValue([]) },
    installedPart: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  getCustomerVehicleHistory,
  sortVehicleHistory,
  type CustomerVehicleHistoryEntry,
} from "../customer-vehicle-history-data"

const D = (iso: string) => new Date(iso)

function inv(over: Record<string, unknown> = {}) {
  return {
    id: 1, slug: "inv-1", documentNo: "INV-1", date: D("2026-01-05"),
    createdAt: D("2026-01-05"), status: "posted", grandTotal: 100,
    paidAmount: 25, ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const m of Object.values(mocks.prismaMock)) {
    m.findMany.mockResolvedValue([])
  }
  mocks.prismaMock.installedPart.findMany.mockResolvedValue([])
})

describe("getCustomerVehicleHistory", () => {
  it("invoice sama dari jembatan langsung + quotation terhitung SEKALI", async () => {
    const shared = inv({ id: 7 })
    mocks.prismaMock.quotation.findMany.mockResolvedValue([
      { id: 3, slug: "q3", documentNo: "Q-3", date: D("2026-01-01"), createdAt: D("2026-01-01"), status: "approved" },
    ])
    // 1=langsung, 2=via quotation (shared dobel), project/SO kosong.
    mocks.prismaMock.salesInvoice.findMany
      .mockResolvedValueOnce([shared])
      .mockResolvedValueOnce([shared, inv({ id: 8, documentNo: "INV-8" })])

    const h = await getCustomerVehicleHistory(42)

    expect(h.counts.sales_invoice).toBe(2)
    expect(h.entries.filter((e) => e.id === 7)).toHaveLength(1)
    const entry = h.entries.find((e) => e.id === 7)!
    expect(entry.grandTotal).toBe(100)
    expect(entry.paidAmount).toBe(25)
  })

  it("invoice via project WO ikut; query project gabung project langsung + WO", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      { id: 21, slug: "wo21", documentNo: "WO-21", date: D("2026-02-01"), createdAt: D("2026-02-01"), status: "in_progress", projectId: 5 },
    ])
    mocks.prismaMock.project.findMany.mockResolvedValue([
      { id: 9, slug: "p9", documentNo: null, name: "Proyek A", startDate: null, createdAt: D("2026-01-15"), status: "active" },
    ])
    mocks.prismaMock.salesInvoice.findMany
      .mockResolvedValueOnce([]) // langsung
      .mockResolvedValueOnce([inv({ id: 11 })]) // via project

    const h = await getCustomerVehicleHistory(42)

    expect(h.counts.sales_invoice).toBe(1)
    expect(h.counts.project).toBe(1)
    const projectCall = mocks.prismaMock.salesInvoice.findMany.mock.calls
      .map((c) => c[0]).find((c) => c?.where?.projectId)
    expect(projectCall?.where?.projectId?.in).toEqual([9, 5])
    // Project tanpa documentNo tampilkan name; tanggal fallback createdAt.
    const proj = h.entries.find((e) => e.kind === "project")!
    expect(proj.documentNo).toBe("Proyek A")
    expect(proj.date).toEqual(D("2026-01-15"))
  })

  it("tanpa relasi: jembatan invoice dilewati, bukan dipanggil in:[]", async () => {
    const h = await getCustomerVehicleHistory(42)

    expect(h.entries).toEqual([])
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.salesInvoice.findMany.mock.calls[0][0].where)
      .toEqual({ customerVehicleId: 42, deletedAt: null })
  })

  it("semua query soft-delete difilter kecuali WO/project (tanpa kolom itu)", async () => {
    await getCustomerVehicleHistory(42)

    expect(mocks.prismaMock.quotation.findMany.mock.calls[0][0].where)
      .toEqual({ customerVehicleId: 42, deletedAt: null })
    expect(mocks.prismaMock.salesOrder.findMany.mock.calls[0][0].where)
      .toEqual({ customerVehicleId: 42, deletedAt: null })
    expect(mocks.prismaMock.workOrder.findMany.mock.calls[0][0].where)
      .toEqual({ customerVehicleId: 42 })
  })

  it("linimasa urut tanggal desc lintas jenis", async () => {
    mocks.prismaMock.quotation.findMany.mockResolvedValue([
      { id: 1, slug: null, documentNo: "Q-1", date: D("2026-01-01"), createdAt: D("2026-01-01"), status: "draft" },
    ])
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      { id: 2, slug: null, documentNo: "WO-2", date: D("2026-03-01"), createdAt: D("2026-03-01"), status: "completed", projectId: null },
    ])

    const h = await getCustomerVehicleHistory(42)
    expect(h.entries.map((e) => e.documentNo)).toEqual(["WO-2", "Q-1"])
  })

  it("seksi part terpasang dari registri InstalledPart kendaraan ini (AC-IP-9)", async () => {
    mocks.prismaMock.installedPart.findMany.mockResolvedValue([{
      id: 5, itemId: 100, serialNumber: "SN-1",
      qty: 1, qtyRemoved: 0,
      installedAt: D("2026-01-10"), removedAt: null, removalReason: null,
      replacedByInstalledPartId: null,
      item: { name: "Aki 12V", sku: "AKI-12" },
      warrantyCoverage: { expiresAt: D("2027-01-10") },
      materialIssueItem: {
        materialIssue: { status: "completed", workOrderId: 10, projectId: null },
      },
    }])

    const h = await getCustomerVehicleHistory(42)

    expect(mocks.prismaMock.installedPart.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerVehicleId: 42 } }),
    )
    expect(h.installedParts.total).toBe(1)
    expect(h.installedParts.rows[0]).toMatchObject({
      id: 5, itemName: "Aki 12V", status: "TERPASANG", sourceWorkOrderId: 10,
    })
  })

  it("kendaraan tanpa part registri: seksi kosong, bukan error (AC-IP-9)", async () => {
    const h = await getCustomerVehicleHistory(42)
    expect(h.installedParts).toMatchObject({ rows: [], total: 0, activeCount: 0 })
  })

  it("includeInstalledParts=false: registri tidak ditanyakan ke DB, seksi kosong", async () => {
    const h = await getCustomerVehicleHistory(42, 20, { includeInstalledParts: false })
    expect(mocks.prismaMock.installedPart.findMany).not.toHaveBeenCalled()
    expect(h.installedParts).toEqual({ rows: [], total: 0, activeCount: 0 })
    // Linimasa lain tetap dimuat.
    expect(h.entries).toEqual([])
  })

  it("limit diklamp 1..100 dan diteruskan sebagai take", async () => {
    await getCustomerVehicleHistory(42, 999)
    expect(mocks.prismaMock.quotation.findMany.mock.calls[0][0].take).toBe(100)
  })
})

describe("sortVehicleHistory", () => {
  const entry = (over: Partial<CustomerVehicleHistoryEntry>): CustomerVehicleHistoryEntry => ({
    kind: "quotation", id: 1, slug: null, documentNo: "X",
    date: D("2026-01-01"), createdAt: D("2026-01-01"), status: "draft",
    grandTotal: null, paidAmount: null, ...over,
  })

  it("tanggal sama: kind lalu id desc, input tidak dimutasi", () => {
    const input = [
      entry({ kind: "project", id: 9 }),
      entry({ kind: "quotation", id: 3 }),
      entry({ kind: "quotation", id: 5 }),
    ]
    expect(sortVehicleHistory(input).map((e) => e.id)).toEqual([5, 3, 9])
    expect(input.map((e) => e.id)).toEqual([9, 3, 5])
  })
})
