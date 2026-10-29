import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Regresi BUGHUNT round2 #8 — konvensi baris total `TableRow`:
 * `cells` hanya sel TRAILING (kolom terakhir); label membentang kolom kiri
 * sisanya (`columns.length - cells.length`). Builder yang mengisi sel kosong
 * di depan membuat angka total geser dari kolomnya di PDF & layar
 * (render.ts drawTableRow + report-table-view.tsx).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    salesInvoice: { findMany: vi.fn() },
    vendorBill: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
    vendor: { findMany: vi.fn() },
    salesPayment: { findMany: vi.fn() },
    salesReturn: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn(), groupBy: vi.fn() },
    item: { findMany: vi.fn() },
    warehouse: { findMany: vi.fn() },
    stockMove: { findMany: vi.fn() },
    inventoryLayer: { findMany: vi.fn() },
  },
  groupBy: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(),
  hasPermission: vi.fn(async () => false),
}))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: vi.fn(async () => ({ costingMethod: "fifo" })) }))

import { loadArApSummary } from "../ar-ap-summary-data"
import { loadPayablesTotal, loadReceivablesAging } from "../aging-reports-data"
import { loadGeneralLedger, loadReceivableSubledger } from "../ledger-cash-data"
import { loadSalesAnalytics, loadStockCard, loadStockValuation, resolveItemIdBySlugOrId, resolveWarehouseIdBySlugOrId } from "../stock-flow-data"
import { loadStockAging, loadStockSummary } from "../stock-simple-data"
import { REPORTS } from "../report-registry"
import { parseReportPeriod } from "../report-period"

import type { TableRow } from "@/lib/pdf/engine/types"

type TotalRow = Extract<TableRow, { kind: "total" }>
function totalsOf(rows: TableRow[]): TotalRow[] {
  return rows.filter((r): r is TotalRow => r.kind === "total")
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const model of Object.values(mocks.prismaMock)) {
    for (const fn of Object.values(model as Record<string, ReturnType<typeof vi.fn>>)) fn.mockResolvedValue([])
  }
})

describe("total trailing: aging & AR/AP", () => {
  it("umur piutang: Jumlah 1 sel (kolom Sisa), bukan 5 sel berawalan kosong", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      {
        id: 1,
        grandTotal: 1000,
        paidAmount: 0,
        dueDate: new Date("2026-01-01"),
        customer: { name: "PT A" },
        documentNo: "INV-1",
        customDocumentNo: null,
      },
    ])
    const report = await loadReceivablesAging()
    const totals = totalsOf(report.table.rows)
    expect(totals).toHaveLength(1)
    expect(totals[0].cells).toHaveLength(1)
    expect(totals[0].cells[0]).toContain("1.000")
  })

  it("total hutang: Jumlah Hutang 1 sel trailing", async () => {
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([
      {
        id: 1,
        vendorId: 1,
        grandTotal: 2000,
        paidAmount: 0,
        withholdingAmount: 0,
        dueDate: new Date("2026-01-01"),
        documentNo: "BILL-1",
        vendor: { name: "PT V" },
      },
    ])
    const report = await loadPayablesTotal()
    const totals = totalsOf(report.table.rows)
    expect(totals.length).toBeGreaterThan(0)
    for (const t of totals) expect(t.cells).toHaveLength(1)
    expect(totals[totals.length - 1].cells[0]).toContain("2.000")
  })

  it("ringkasan AR/AP: ketiga total 1 sel trailing (Belum Lunas)", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 1, grandTotal: 1000, paidAmount: 0, dueDate: new Date("2026-01-01"), customer: { name: "PT A" } },
    ])
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([
      { id: 1, grandTotal: 500, paidAmount: 0, withholdingAmount: 0, dueDate: new Date("2026-01-01"), vendor: { name: "PT V" } },
    ])
    const report = await loadArApSummary()
    const totals = totalsOf(report.table.rows)
    expect(totals.map((t) => t.label)).toEqual(["Jumlah Piutang", "Jumlah Hutang", "Posisi Bersih (AR − AP)"])
    for (const t of totals) expect(t.cells).toHaveLength(1)
  })
})

describe("total trailing: buku pembantu", () => {
  it("Total & Saldo Akhir 3 sel trailing (Debit/Kredit/Saldo), bukan 6", async () => {
    mocks.prismaMock.customer.findMany.mockResolvedValue([{ id: 1, slug: "pt-a" }])
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 1, documentNo: "INV-1", customDocumentNo: null, date: new Date("2026-10-05"), grandTotal: 1000 },
    ])
    mocks.prismaMock.salesPayment.findMany.mockResolvedValue([])
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([])
    const report = await loadReceivableSubledger(
      { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) },
      "pt-a",
    )
    const totals = totalsOf(report.table.rows)
    expect(totals).toHaveLength(1)
    expect(totals[0].cells).toHaveLength(3)
    expect(totals[0].cells[0]).toContain("1.000")
  })
})

describe("total trailing: buku besar & stok (lanjutan #8)", () => {
  it("buku besar: Total & Saldo Akhir 3 sel trailing (Debit/Kredit/Saldo)", async () => {
    mocks.prismaMock.account.findMany.mockResolvedValue([{ id: 1, slug: "kas" }])
    mocks.prismaMock.journalEntry.findMany.mockResolvedValue([
      {
        debit: 1000,
        credit: 0,
        memo: null,
        journal: { journalNumber: "JU-1", transactionDate: new Date("2026-10-05"), description: "Setoran" },
      },
    ])
    const report = await loadGeneralLedger(
      { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) },
      "kas",
    )
    const totals = totalsOf(report.table.rows)
    expect(totals).toHaveLength(1)
    expect(totals[0].cells).toHaveLength(3)
    expect(report.table.columns).toHaveLength(6)
  })

  it("valuasi stok PDF: Jumlah 2 sel trailing (Jml/Total Nilai), bukan 8 berawalan kosong", async () => {
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 1, code: "GDG", name: "Utama" }])
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([
      {
        itemId: 1,
        warehouseId: 1,
        remaining: 2,
        unitCost: 500,
        item: { sku: "BSI", name: "Busi", unitOfMeasure: "pcs", cost: 500, costingMethod: "fifo", category: null },
      },
    ])
    const report = await loadStockValuation(null)
    const totals = totalsOf(report.table.rows)
    expect(totals).toHaveLength(1)
    expect(totals[0].cells).toHaveLength(2)
    // Sel pertama harus qty kolom Jml, bukan kosong yang menggeser ke kanan.
    expect(totals[0].cells[0]).not.toBe("")
    expect(totals[0].cells[1]).toContain("1.000")
  })

  it("analisis penjualan PDF: Jumlah 2 sel trailing (Nilai/Porsi)", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      {
        customer: { id: 1, name: "PT A" },
        items: [{ itemId: 1, description: "Busi", qty: 2, total: 1000 }],
      },
    ])
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 1, sku: "BSI", name: "Busi", brand: null }])
    const report = await loadSalesAnalytics(
      { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) },
      "barang",
    )
    const totals = totalsOf(report.table.rows)
    expect(totals).toHaveLength(1)
    expect(totals[0].cells).toEqual([expect.stringContaining("1.000"), "100%"])
  })

  it("kartu stok: Saldo Akhir data bold sejajar Masuk/Keluar/Saldo (bukan total geser)", async () => {
    mocks.prismaMock.stockMove.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 1,
          date: new Date("2026-10-05"),
          createdAt: new Date("2026-10-05"),
          documentNo: "SM-1",
          moveType: "receipt",
          impact: "IN",
          qty: 10,
          cost: 100,
          referenceType: null,
          referenceId: null,
          description: null,
          warehouse: { code: "GDG" },
        },
      ])
    const report = await loadStockCard({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }, 7, null)
    expect(totalsOf(report.table.rows)).toHaveLength(0)
    const closing = report.table.rows.find((r) => r.kind === "data" && r.cells[1] === "Saldo Akhir")
    expect(closing?.kind === "data" ? closing.cells : []).toHaveLength(8)
    expect(closing?.kind === "data" ? closing.cells[6] : "").toContain("10")
  })

  it("umur stok: Jumlah data bold di kolom Kuantitas (bukan total trailing geser)", async () => {
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([
      {
        remaining: 5,
        createdAt: new Date(),
        item: { sku: "BSI", name: "Busi", unitOfMeasure: "pcs", category: null },
      },
    ])
    const report = await loadStockAging()
    expect(totalsOf(report.table.rows)).toHaveLength(0)
    const closing = report.table.rows.find((r) => r.kind === "data" && r.cells[1] === "Jumlah")
    expect(closing?.kind === "data" ? closing.cells[4] : "").toContain("5")
  })

  it("ringkasan stok: Jumlah 2 sel trailing (Total Qty/Total Nilai)", async () => {
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 1, code: "GDG", name: "Utama" }])
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([
      { itemId: 1, warehouseId: 1, remaining: 2, unitCost: 500 },
    ])
    const report = await loadStockSummary()
    const totals = totalsOf(report.table.rows)
    expect(totals).toHaveLength(1)
    expect(totals[0].cells).toHaveLength(2)
  })

  it("valuasi-stok PDF: slug gudang menyaring where gudang (registry #9)", async () => {
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 3, slug: "gudang-utama", code: "GDG", name: "Utama" }])
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([])
    await REPORTS["valuasi-stok"].load({ period: parseReportPeriod("2026-10", { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }), search: { gudang: "gudang-utama" } })
    expect(mocks.prismaMock.inventoryLayer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ warehouseId: 3 }) }),
    )
  })
})

describe("registry stok: slug ATAU id (BUGHUNT round2 #9)", () => {
  it("resolver barang/gudang menerima slug dan id, menolak tak dikenal", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 7, slug: "busi-iridium" }])
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 3, slug: "gudang-utama" }])
    expect(await resolveItemIdBySlugOrId("busi-iridium")).toBe(7)
    expect(await resolveItemIdBySlugOrId("7")).toBe(7)
    expect(await resolveItemIdBySlugOrId("tidak-ada")).toBeNull()
    expect(await resolveItemIdBySlugOrId(null)).toBeNull()
    expect(await resolveWarehouseIdBySlugOrId("gudang-utama")).toBe(3)
    expect(await resolveWarehouseIdBySlugOrId("3")).toBe(3)
  })

  it("kartu-stok PDF: slug barang diteruskan ke loader (dulu dibuang regex digit)", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 7, slug: "busi-iridium" }])
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 3, slug: "gudang-utama" }])
    mocks.prismaMock.stockMove.findMany.mockResolvedValue([])
    const period = parseReportPeriod("2026-10", { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })
    const payload = await REPORTS["kartu-stok"].load({
      period,
      search: { barang: "busi-iridium", gudang: "gudang-utama" },
    })
    expect(payload.kind).toBe("table")
    // Tanpa resolusi slug, loader mengembalikan notice "Pilih barang dahulu".
    if (payload.kind === "table") {
      expect(JSON.stringify(payload.table.rows)).not.toContain("Pilih barang terlebih dahulu")
    }
    expect(mocks.prismaMock.stockMove.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ itemId: 7, warehouseId: 3 }) }),
    )
  })

  it("mutasi-stok PDF: slug gudang menyaring where.warehouseId", async () => {
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 3, slug: "gudang-utama" }])
    mocks.prismaMock.stockMove.findMany.mockResolvedValue([])
    const period = parseReportPeriod("2026-10", { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })
    await REPORTS["mutasi-stok"].load({ period, search: { gudang: "gudang-utama" } })
    expect(mocks.prismaMock.stockMove.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ warehouseId: 3 }) }),
    )
  })

  it("kartu-stok PDF: id numerik tetap jalan (kompat lama)", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 7, slug: "busi-iridium" }])
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([])
    mocks.prismaMock.stockMove.findMany.mockResolvedValue([])
    const period = parseReportPeriod("2026-10", { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })
    await REPORTS["kartu-stok"].load({ period, search: { barang: "7" } })
    expect(mocks.prismaMock.stockMove.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ itemId: 7 }) }),
    )
  })
})
