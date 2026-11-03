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
    customer: { findMany: vi.fn(), findFirst: vi.fn() },
    invoiceExchangeItem: { findMany: vi.fn() },
    journal: { findMany: vi.fn() },
    activityLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    vendor: { findMany: vi.fn() },
    salesPayment: { findMany: vi.fn() },
    salesReturn: { findMany: vi.fn() },
    account: { findMany: vi.fn(), findFirst: vi.fn() },
    // Perf S3-A: saldo awal buku besar kini sumNetForAccount (aggregate),
    // bukan groupBy semua akun.
    journalEntry: { findMany: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn(async () => ({ _sum: { debit: 0, credit: 0 }, _count: 0 })) },
    item: { findMany: vi.fn(), findFirst: vi.fn() },
    warehouse: { findMany: vi.fn(), findFirst: vi.fn() },
    stockMove: { findMany: vi.fn() },
    inventoryLayer: { findMany: vi.fn() },
    $queryRaw: vi.fn(async () => []),
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
import { loadPayablesAging, loadPayablesTotal, loadReceivablesAging } from "../aging-reports-data"
import { loadGeneralLedger, loadReceivableSubledger } from "../ledger-cash-data"
import { loadSalesAnalytics, loadStockCard, loadStockValuation, resolveItemIdBySlugOrId, resolveWarehouseIdBySlugOrId } from "../stock-flow-data"
import { loadStockAging, loadStockSummary } from "../stock-simple-data"
import { REPORTS } from "../report-registry"
import { parseReportPeriod } from "../report-period"
import { loadCustomerStatement } from "../customer-statement-data"
import { buildBankMovements } from "../bank-movements"
import { buildJournalListing } from "../journal-listing"
import { buildJobOrderCost } from "../job-order-cost"
import { buildJobOrderCompletion } from "../job-order-completion"
import { buildReceivedNotBilled } from "../received-not-billed"
import { buildSptTableRows, loadVatReconciliation, SPT_COLUMNS } from "../tax-summary-data"
import { buildDeliveredUnbilledTable } from "../delivered-unbilled-export"
import { buildDiscountExposureTable } from "../discount-exposure-export"
import { buildOutstandingLines } from "../outstanding-lines"
import type { DiscountExposure } from "../discount-exposure"
import { buildPaymentExpenses } from "../payment-expenses"
import { buildStockCount } from "../stock-count"
import { buildMinStock } from "../min-stock"
import { buildSalesProcessHistory } from "../sales-process-history"
import { buildPurchaseProcessHistory } from "../purchase-process-history"
import { buildPayrollByEmployee, buildPayrollComposition, buildPph21 } from "../payroll-reports"
import { buildSlowMovingStock } from "../slow-moving-stock"
import { buildTransferInTransit } from "../transfer-in-transit"
import { buildWithholdingCertificateTable } from "../withholding-certificates"
import { buildInventoryReconciliation } from "../inventory-reconciliation"
import { buildAssetMovement } from "../asset-movement"
import { buildWipAgingTable } from "../wip-aging-export"
import { buildVendorPriceListing } from "../vendor-prices"

import type { TableRow } from "@/lib/pdf/engine/types"

type TotalRow = Extract<TableRow, { kind: "total" }>
function totalsOf(rows: TableRow[]): TotalRow[] {
  return rows.filter((r): r is TotalRow => r.kind === "total")
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const model of Object.values(mocks.prismaMock)) {
    if (typeof model === "function") {
      ;(model as ReturnType<typeof vi.fn>).mockResolvedValue([])
      continue
    }
    for (const fn of Object.values(model as Record<string, ReturnType<typeof vi.fn>>)) fn.mockResolvedValue([])
  }
  // Perf S3-A: aggregate untuk saldo awal buku besar mengembalikan bentuk
  // Prisma lengkap (beforeEach di atas menimpa mockResolvedValue-mu).
  mocks.prismaMock.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 0, credit: 0 }, _count: 0 })
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
      { id: 1, customerId: 1, grandTotal: 1000, paidAmount: 0, dueDate: new Date("2026-01-01"), customer: { name: "PT A" } },
    ])
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([
      { id: 1, vendorId: 1, grandTotal: 500, paidAmount: 0, withholdingAmount: 0, dueDate: new Date("2026-01-01"), vendor: { name: "PT V" } },
    ])
    const report = await loadArApSummary()
    const totals = totalsOf(report.table.rows)
    expect(totals.map((t) => t.label)).toEqual(["Jumlah Piutang", "Jumlah Hutang", "Posisi Bersih (AR − AP)"])
    for (const t of totals) expect(t.cells).toHaveLength(1)
  })
})

describe("aging loader: saringan DB + asOf periode (BUGHUNT round3 A)", () => {
  it("piutang: where dueDate not null diteruskan ke Prisma; baris tanpa jatuh tempo tak dimuat", async () => {
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
    await loadReceivablesAging(new Date(2026, 9, 31))
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dueDate: { not: null }, deletedAt: null }),
      }),
    )
  })

  it("hutang jatuh tempo: where dueDate not null; total hutang tetap muat tanpa jatuh tempo", async () => {
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([])
    await loadPayablesAging(new Date(2026, 9, 31))
    expect(mocks.prismaMock.vendorBill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dueDate: { not: null } }),
      }),
    )
    vi.clearAllMocks()
    for (const model of Object.values(mocks.prismaMock)) {
      if (typeof model === "function") {
        ;(model as ReturnType<typeof vi.fn>).mockResolvedValue([])
        continue
      }
      for (const fn of Object.values(model as Record<string, ReturnType<typeof vi.fn>>)) fn.mockResolvedValue([])
    }
    await loadPayablesTotal(new Date(2026, 9, 31))
    const where = mocks.prismaMock.vendorBill.findMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty("dueDate")
  })

  it("registry aging meneruskan period.end sebagai asOf (bucket per akhir periode)", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      {
        id: 1,
        grandTotal: 1000,
        paidAmount: 0,
        // Jatuh tempo 15 Okt; per 31 Okt = 16 hari telat → bucket 1–30 Hari.
        dueDate: new Date(2026, 9, 15),
        customer: { name: "PT A" },
        documentNo: "INV-1",
        customDocumentNo: null,
      },
    ])
    const period = parseReportPeriod("2026-10", { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })
    const payload = await REPORTS["piutang-jatuh-tempo"].load({ period, search: {} })
    expect(payload.kind).toBe("table")
    if (payload.kind === "table") {
      const bucketRow = payload.table.rows.find(
        (r) => r.kind === "data" && r.cells[0] === "1–30 Hari",
      )
      expect(bucketRow?.kind === "data" ? bucketRow.cells[4] : "").toContain("1.000")
      expect(payload.periodCaption).toContain("31 Okt 2026")
    }
  })

  it("loader tanpa argumen tetap asOf hari ini (layar tak berubah)", async () => {
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([
      {
        id: 1,
        vendorId: 1,
        grandTotal: 2000,
        paidAmount: 0,
        withholdingAmount: 0,
        dueDate: new Date(),
        documentNo: "BILL-1",
        vendor: { name: "PT V" },
      },
    ])
    const report = await loadPayablesAging()
    const totals = totalsOf(report.table.rows)
    expect(totals[totals.length - 1].cells[0]).toContain("2.000")
  })
})

describe("total trailing: buku pembantu", () => {
  it("Total & Saldo Akhir 3 sel trailing (Debit/Kredit/Saldo), bukan 6", async () => {
    mocks.prismaMock.customer.findFirst.mockResolvedValue({ id: 1 })
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
    mocks.prismaMock.account.findFirst.mockResolvedValue({ id: 1 })
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
    mocks.prismaMock.stockMove.findMany.mockResolvedValueOnce([
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
    const warehouses = [{ id: 3, slug: "gudang-utama" }]
    mocks.prismaMock.warehouse.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      const w = args.where
      return warehouses.find((r) => (typeof w.slug === "string" ? r.slug === w.slug : true) && (typeof w.id === "number" ? r.id === w.id : true)) ?? null
    })
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([])
    await REPORTS["valuasi-stok"].load({ period: parseReportPeriod("2026-10", { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }), search: { gudang: "gudang-utama" } })
    expect(mocks.prismaMock.inventoryLayer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ warehouseId: 3 }) }),
    )
  })
})

describe("total trailing: BUGHUNT round3 #1 (leading blank geser kolom)", () => {
  const period = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }

  /** Simulasi renderer: sel total i mendarat di kolom columns.length - cells.length + i. */
  function assertTrailing(table: { columns: { header: string }[]; rows: TableRow[] }) {
    const totals = totalsOf(table.rows)
    expect(totals.length).toBeGreaterThan(0)
    for (const t of totals) {
      expect(t.cells.length).toBeLessThanOrEqual(table.columns.length)
      expect(t.cells[0]).not.toBe("")
    }
    return totals
  }
  function landed(table: { columns: { header: string }[] }, total: TotalRow): Record<string, string> {
    const start = table.columns.length - total.cells.length
    const out: Record<string, string> = {}
    total.cells.forEach((cell, i) => {
      out[table.columns[start + i].header] = cell
    })
    return out
  }

  it("statement pelanggan: Debit/Kredit/Saldo di 3 kolom terakhir, saldo akhir tidak terpotong", async () => {
    mocks.prismaMock.customer.findFirst
      .mockResolvedValueOnce({ id: 1, name: "PT A" })
      .mockResolvedValueOnce({ phone: null, email: null })
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 1, documentNo: "INV-1", date: new Date("2026-10-05"), grandTotal: 1000, dueDate: null },
    ])
    const report = await loadCustomerStatement(1, period)
    expect(report.table.columns).toHaveLength(7)
    const totals = assertTrailing(report.table)
    expect(totals).toHaveLength(1)
    expect(totals[0].cells).toHaveLength(3)
    const cols = landed(report.table, totals[0])
    expect(cols["Debit"]).toContain("1.000")
    expect(cols["Saldo"]).toContain("1.000")
  })

  it("mutasi bank: Penerimaan/Pengeluaran/Arus Bersih/Transaksi trailing", () => {
    const result = buildBankMovements({
      movements: [
        {
          accountId: 1,
          accountCode: "1101",
          accountName: "BCA",
          date: new Date("2026-10-05"),
          kind: "Penerimaan",
          documentNo: "PAY-1",
          counterparty: "PT A",
          amount: 1000,
        },
      ],
      ...period,
    })
    const totals = assertTrailing(result.summaryTable)
    expect(totals[0].cells).toHaveLength(4)
    const cols = landed(result.summaryTable, totals[0])
    expect(cols["Penerimaan"]).toContain("1.000")
    expect(cols["Transaksi"]).toBe("1")
  })

  it("daftar jurnal: Debit/Kredit trailing", () => {
    const result = buildJournalListing({
      journals: [
        {
          id: 1,
          journalNumber: "JU-1",
          date: new Date("2026-10-05"),
          title: "JU-1",
          description: null,
          lines: [{ accountCode: "1101", accountName: "Kas", debit: 1000, credit: 1000 }],
        },
      ],
      emptyNotice: "kosong",
    })
    const totals = assertTrailing(result.table)
    expect(totals[0].cells).toHaveLength(2)
    const cols = landed(result.table, totals[0])
    expect(cols["Debit"]).toContain("1.000")
    expect(cols["Kredit"]).toContain("1.000")
  })

  it("biaya pekerjaan: Bahan..Biaya/Unit trailing (5 sel, tanpa leading blank)", () => {
    const result = buildJobOrderCost({
      jobs: [
        {
          id: 1,
          documentNo: "WO-1",
          date: new Date("2026-10-05"),
          customerName: null,
          status: "in_progress",
          materialCost: 600,
          productionCost: 400,
          completedQty: 2,
        },
      ],
      ...period,
    })
    const totals = assertTrailing(result.table)
    for (const t of totals) expect(t.cells).toHaveLength(5)
    const cols = landed(result.table, totals[totals.length - 1])
    expect(cols["Bahan"]).toContain("600")
    expect(cols["Total Biaya"]).toContain("1.000")
    expect(cols["Biaya / Unit"]).toContain("500")
  })

  it("penyelesaian pekerjaan: Qty/(Harga/Unit kosong)/Total Biaya trailing", () => {
    const result = buildJobOrderCompletion({
      completions: [
        {
          documentNo: "PG-1",
          date: new Date("2026-10-05"),
          jobLabel: "WO-1",
          itemCode: "FG-1",
          itemName: "Pagar",
          qty: 2,
          unitCost: 500,
          totalCost: 1000,
        },
      ],
      ...period,
    })
    const totals = assertTrailing(result.table)
    for (const t of totals) expect(t.cells).toEqual(["2", "", "1.000"])
    const cols = landed(result.table, totals[totals.length - 1])
    expect(cols["Qty"]).toBe("2")
    expect(cols["Total Biaya"]).toContain("1.000")
  })

  it("diterima belum ditagih: Diterima/Ditagih/Selisih trailing", () => {
    const result = buildReceivedNotBilled({
      lines: [
        {
          goodsReceiptId: 1,
          receiptNo: "GR-1",
          receiptDate: new Date("2026-10-10"),
          vendorName: "CV V",
          sku: "B-1",
          name: "Busi",
          receivedQty: 10,
          unitCost: 100,
          billedValue: 400,
        },
      ],
      ledger: null,
      asOf: new Date("2026-10-31"),
      periodEndIsToday: true,
    })
    const totals = assertTrailing(result.detail)
    for (const t of totals) expect(t.cells).toHaveLength(3)
    const cols = landed(result.detail, totals[totals.length - 1])
    expect(cols["Diterima"]).toContain("1.000")
    expect(cols["Selisih"]).toContain("600")
  })

  it("rekonsiliasi PPN: Selisih 1 sel trailing; SPT: Neto SPT mendarat di kolom Neto SPT", async () => {
    mocks.prismaMock.journalEntry.findMany.mockResolvedValue([{ debit: 0, credit: 1000 }])
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([{ taxAmount: 1000 }])
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([])
    const recon = await loadVatReconciliation(period)
    const reconTotals = assertTrailing(recon.table)
    expect(reconTotals[0].cells).toHaveLength(1)
    expect(landed(recon.table, reconTotals[0])["Selisih"]).toBeDefined()
  })

  it("regression round 17: rekonsiliasi PPN document output net of return VAT on note-date period", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([{ taxAmount: 1000 }])
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([])
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([
      { date: new Date(2026, 8, 20), taxReturnNoteDate: new Date(2026, 9, 2), items: [{ returnVat: 110 }] },
      { date: new Date(2026, 9, 3), taxReturnNoteDate: new Date(2026, 10, 1), items: [{ returnVat: 999 }] },
    ])
    const recon = await loadVatReconciliation(period)
    const outputRow = recon.table.rows.find((r) => r.kind === "data" && r.cells[0] === "PPN Keluaran")
    expect(outputRow?.kind === "data" ? outputRow.cells : []).toEqual(["PPN Keluaran", "0", "890", "(890)"])
  })

  it("putaran 81: rekonsiliasi PPN docOutput net retur legacy hitung-ulang (tanpa snapshot)", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([{ taxAmount: 11000 }])
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([])
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([
      {
        date: new Date(2026, 9, 10),
        taxReturnNoteDate: null,
        salesInvoice: { subtotal: 100000, discount: 0, taxAmount: 11000 },
        items: [{ returnVat: null, qty: 2, price: 50000 }],
      },
    ])
    const recon = await loadVatReconciliation(period)
    const outputRow = recon.table.rows.find((r) => r.kind === "data" && r.cells[0] === "PPN Keluaran")
    // PPN retur legacy = 2 x 50.000 x 11% = 11.000 -> docOutput 0, bukan 11.000.
    expect(outputRow?.kind === "data" ? outputRow.cells : []).toEqual(["PPN Keluaran", "0", "0", "0"])
  })

  it("regression round 18: rekonsiliasi PPN docInput nol untuk bill tanpa nomor faktur pajak valid", async () => {
    mocks.prismaMock.journalEntry.findMany.mockResolvedValue([])
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([])
    mocks.prismaMock.vendorBill.findMany.mockResolvedValue([
      { tax: 11_000_000, taxInvoiceNumber: null },
      { tax: 1_100_000, taxInvoiceNumber: "010.006-26.00000001" },
    ])
    const recon = await loadVatReconciliation(period)
    const inputRow = recon.table.rows.find((r) => r.kind === "data" && r.cells[0] === "PPN Masukan")
    expect(inputRow?.kind === "data" ? inputRow.cells : []).toEqual(["PPN Masukan", "0", "1.100.000", "(1.100.000)"])
  })

  it("SPT rows still render after reconciliation regression", async () => {
    const sptRows = buildSptTableRows([
      {
        period: "2026-10",
        outputVat: 1100,
        returnVat: 100,
        inputVat: 400,
        net: 600,
        kurangBayar: true,
        source: "tax_invoice",
        journalLiability: 600,
        journalVsSptDiff: 0,
        paid: 600,
        balance: 0,
        overpaid: false,
      },
    ])
    const sptTable = { columns: SPT_COLUMNS, rows: sptRows }
    const sptTotals = assertTrailing(sptTable)
    expect(sptTotals[0].cells).toHaveLength(5)
    expect(landed(sptTable, sptTotals[0])["Neto SPT"]).toContain("600")
  })

  it("terkirim belum terfaktur: 3 nilai trailing", () => {
    const table = buildDeliveredUnbilledTable({
      rows: [
        {
          documentNo: "SO-1",
          customerName: "PT A",
          date: new Date("2026-10-01"),
          lastDeliveryAt: new Date("2026-10-05"),
          ageDays: 26,
          deliveredValue: 1000,
          billedValue: 400,
          unbilledValue: 600,
        } as never,
      ],
      totalDocuments: 1,
      totalDeliveredValue: 1000,
      totalBilledValue: 400,
      totalUnbilledValue: 600,
    })
    const totals = assertTrailing(table)
    expect(totals[0].cells).toHaveLength(3)
    const cols = landed(table, totals[0])
    expect(cols["Nilai Terkirim"]).toContain("1.000")
    expect(cols["Belum Terfaktur"]).toContain("600")
  })

  it("paparan diskon: Bruto/Diskon Efektif/% Efektif/Label Ambang trailing, jumlah dokumen di label", () => {
    const exposure: DiscountExposure = {
      dokumen: [
        {
          docType: "SALES_INVOICE",
          docId: 1,
          slug: "inv-1",
          documentNo: "INV-1",
          date: new Date("2026-10-10"),
          status: "posted",
          customerId: 1,
          customerName: "PT A",
          salesEmployeeId: null,
          salesEmployeeName: null,
          subtotal: 900,
          headerDiscount: 0,
          grandTotal: 900,
          lines: [],
          bruto: 1000,
          diskonBaris: 100,
          diskonHeader: 0,
          diskonEfektif: 100,
          persenEfektif: 10,
          labelAmbang: "MELEBIHI_AMBANG",
          labelAmbangText: "Melebihi Ambang",
          penjualLabel: "–",
        } as DiscountExposure["dokumen"][number],
      ],
      ringkasan: [],
      totalDokumen: 1,
      totalBruto: 1000,
      totalDiskonEfektif: 100,
      persenTertimbang: 10,
      jumlahMelebihiAmbang: 1,
    }
    const table = buildDiscountExposureTable({ exposure, periodCaption: "Oktober 2026" })
    const totals = assertTrailing(table)
    expect(totals[0].label).toContain("1 dokumen")
    expect(totals[0].cells).toHaveLength(6)
    const cols = landed(table, totals[0])
    expect(cols["Bruto"]).toContain("1.000")
    expect(cols["Diskon Efektif"]).toContain("100")
    expect(cols["Label Ambang"]).toContain("melebihi ambang")
  })

  it("baris pesanan bersisa: Nilai Sisa 1 sel trailing", () => {
    const result = buildOutstandingLines({
      documents: [
        {
          documentNo: "PO-1",
          date: new Date("2026-10-05"),
          partyName: "CV V",
          status: "ordered",
          items: [{ sku: "B-1", name: "Busi", unit: "pcs", orderedQty: 10, fulfilledQty: 4, unitPrice: 100 }],
        },
      ],
      ...period,
      wording: {
        fulfilledColumn: "Diterima",
        fulfilledPast: "diterima",
        fulfilledActive: "menerima",
        emptyNotice: "Tidak ada sisa.",
      },
    })
    const totals = assertTrailing(result.table)
    for (const t of totals) expect(t.cells).toHaveLength(1)
    expect(landed(result.table, totals[totals.length - 1])["Nilai Sisa"]).toContain("600")
  })
})

describe("total trailing: BUGHUNT round3 lanjutan (5 builder diminta + temuan audit)", () => {
  const period = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }

  function assertTrailing(table: { columns: { header: string }[]; rows: TableRow[] }) {
    const totals = totalsOf(table.rows)
    expect(totals.length).toBeGreaterThan(0)
    for (const t of totals) {
      expect(t.cells.length).toBeLessThanOrEqual(table.columns.length)
      expect(t.cells[0]).not.toBe("")
    }
    return totals
  }
  function landed(table: { columns: { header: string }[] }, total: TotalRow): Record<string, string> {
    const start = table.columns.length - total.cells.length
    const out: Record<string, string> = {}
    total.cells.forEach((cell, i) => {
      out[table.columns[start + i].header] = cell
    })
    return out
  }

  it("beban pembayaran: subtotal + grand 1 sel di kolom Beban Admin", () => {
    const result = buildPaymentExpenses({
      expenses: [
        { date: new Date(2026, 9, 5), documentNo: "PAY-1", source: "Pembayaran Vendor", counterparty: "PT V", adminFee: 1000 },
      ],
      ...period,
    })
    const totals = assertTrailing(result.table)
    expect(totals.map((t) => t.cells)).toEqual([["1.000"], ["1.000"]])
    expect(landed(result.table, totals[0])["Beban Admin"]).toContain("1.000")
  })

  it("stok opname: subtotal per dokumen + grand 1 sel di kolom Nilai Selisih", () => {
    const result = buildStockCount({
      documents: [
        {
          documentNo: "SA-1",
          date: new Date(2026, 9, 5),
          warehouseName: "Utama",
          status: "approved",
          items: [{ sku: "BSI", name: "Busi", systemQty: 10, actualQty: 8, unit: "pcs", unitCost: 500 }],
        },
      ],
      ...period,
    })
    const totals = assertTrailing(result.table)
    expect(totals.map((t) => t.cells)).toEqual([["(1.000)"], ["(1.000)"]])
    expect(landed(result.table, totals[0])["Nilai Selisih"]).toContain("1.000")
  })

  it("stok minimum: grand 1 sel di kolom Nilai Kurang", () => {
    const result = buildMinStock([
      { sku: "BSI", name: "Busi", unit: "pcs", categoryName: null, warehouseName: "Utama", vendorName: null, qtyOnHand: 2, minStock: 10, cost: 500 },
    ])
    const totals = assertTrailing(result.table)
    expect(totals[0].cells).toEqual(["4.000"])
    expect(landed(result.table, totals[0])["Nilai Kurang"]).toContain("4.000")
  })

  it("histori penjualan: Ditagih/Dibayar/Sisa di kolomnya, Status trailing kosong", () => {
    const result = buildSalesProcessHistory([
      { orderNo: "SO-1", date: new Date(2026, 9, 5), customerName: "PT A", status: "invoiced", deliveryCount: 1, invoiceCount: 1, invoiced: 1000, paid: 400 },
    ])
    const totals = assertTrailing(result.table)
    // 3 nilai + 1 trailing kosong untuk kolom teks Status (bukan leading blank).
    expect(totals[0].cells).toHaveLength(4)
    const cols = landed(result.table, totals[0])
    expect(cols["Ditagih"]).toContain("1.000")
    expect(cols["Dibayar"]).toContain("400")
    expect(cols["Sisa"]).toContain("600")
    expect(cols["Status"]).toBe("")
  })

  it("histori pembelian: Ditagih/Dibayar/Sisa trailing (tanpa kolom Permintaan ikut kosong)", () => {
    const result = buildPurchaseProcessHistory([
      { orderNo: "PO-1", date: new Date(2026, 9, 5), vendorName: "PT V", status: "billed", requestNo: null, receiptCount: 1, billCount: 1, billed: 1000, paid: 400 },
    ])
    const totals = assertTrailing(result.table)
    expect(totals[0].cells).toHaveLength(3)
    const cols = landed(result.table, totals[0])
    expect(cols["Ditagih"]).toContain("1.000")
    expect(cols["Sisa"]).toContain("600")
  })

  it("gaji per karyawan: 7 sel trailing Slip..Bersih tetap utuh", () => {
    const row = {
      employeeName: "Budi",
      npwp: null,
      baseSalary: 1000,
      allowances: 0,
      appreciation: 0,
      overtime: 0,
      deductions: 0,
      bpjsHealth: 0,
      bpjsEmployment: 0,
      pph21: 100,
      gross: 1000,
      net: 900,
    }
    const byEmployee = buildPayrollByEmployee({ rows: [row], draftSlips: 0, duplicateEmployees: [] })
    const empTotals = assertTrailing(byEmployee.table)
    expect(empTotals[0].cells).toHaveLength(7)
    expect(landed(byEmployee.table, empTotals[0])["Slip"]).toBe("1")
    expect(landed(byEmployee.table, empTotals[0])["Bersih"]).toContain("900")
  })

  it("pph21: Slip mendarat di kolom Slip, bukan NPWP (leading blank dihapus)", () => {
    const row = {
      employeeName: "Budi",
      npwp: "12.345",
      baseSalary: 1000,
      allowances: 0,
      appreciation: 0,
      overtime: 0,
      deductions: 0,
      bpjsHealth: 0,
      bpjsEmployment: 0,
      pph21: 100,
      gross: 1000,
      net: 900,
    }
    const pph = buildPph21({ rows: [row], draftSlips: 0 })
    const totals = assertTrailing(pph.table)
    // Dulu: [Slip, "", Bruto, PPh, Bersih] — Slip pendarat di kolom Karyawan.
    expect(totals[0].cells).toHaveLength(4)
    const cols = landed(pph.table, totals[0])
    expect(cols["Slip"]).toBe("1")
    expect(cols["Bruto"]).toContain("1.000")
    expect(cols["PPh 21"]).toContain("100")
    expect(cols["Bersih"]).toContain("900")
    expect("NPWP" in cols).toBe(false)
  })

  it("porsi gaji: Bruto/Potongan/Bersih 2 sel (Jumlah/Porsi) tetap utuh", () => {
    const row = {
      employeeName: "Budi",
      npwp: null,
      baseSalary: 1000,
      allowances: 0,
      appreciation: 0,
      overtime: 0,
      deductions: 0,
      bpjsHealth: 0,
      bpjsEmployment: 0,
      pph21: 100,
      gross: 1000,
      net: 900,
    }
    const composition = buildPayrollComposition({ rows: [row], draftSlips: 0 })
    const totals = assertTrailing(composition.table)
    for (const t of totals) expect(t.cells).toHaveLength(2)
    expect(landed(composition.table, totals[totals.length - 1])["Jumlah"]).toContain("900")
  })

  it("stok lambat: grand 1 sel di kolom Nilai Sisa", () => {
    const result = buildSlowMovingStock({
      items: [{ sku: "BSI", name: "Busi", categoryName: null, unit: "pcs", remainingQty: 2, remainingValue: 1000, lastOutDate: null }],
      asOf: new Date(2026, 9, 31),
    })
    const totals = assertTrailing(result.table)
    expect(totals[0].cells).toEqual(["1.000"])
  })

  it("transfer berjalan: subtotal + grand 1 sel di kolom Nilai", () => {
    const result = buildTransferInTransit({
      transfers: [
        {
          documentNo: "TRF-1",
          date: new Date(2026, 9, 5),
          sourceName: "A",
          destinationName: "B",
          items: [{ sku: "BSI", name: "Busi", unit: "pcs", qty: 2, unitCost: 500 }],
        },
      ],
      asOf: new Date(2026, 9, 31),
      periodEndIsToday: true,
    })
    const totals = assertTrailing(result.table)
    expect(totals.map((t) => t.cells)).toEqual([["1.000"], ["1.000"]])
  })

  it("bukti potong: total per sisi 1 sel di kolom PPh Dipotong (bukan DPP)", () => {
    const result = buildWithholdingCertificateTable([
      { side: "purchase", date: new Date(2026, 9, 5), certificateNo: "BP-1", documentNo: "BILL-1", counterparty: "PT V", typeCode: "PPh23", typeName: "Jasa", rate: 2, dpp: 50000, withheld: 1000 },
    ])
    const table = { columns: result.columns, rows: result.rows }
    const totals = assertTrailing(table)
    expect(totals[0].cells).toEqual(["1.000"])
    expect(landed(table, totals[0])["PPh Dipotong"]).toContain("1.000")
  })

  it("rekonsiliasi persediaan: Selisih 1 sel di kolom Nilai", () => {
    const result = buildInventoryReconciliation({
      valuation: { qty: 2, value: 1000, byWarehouse: [] },
      ledger: { accountLabel: "Persediaan", balance: 1500 },
      periodEndIsToday: true,
    })
    const totals = assertTrailing(result.table)
    expect(totals[0].cells).toEqual(["500"])
  })

  it("pergerakan aset: Jumlah Penyusutan tanpa placeholder harga perolehan", () => {
    const result = buildAssetMovement({ assets: [], entries: [], start: period.start, end: period.end })
    const totals = assertTrailing(result.table)
    const depreciation = totals.find((t) => t.label === "Jumlah Penyusutan")
    expect(depreciation?.cells).toEqual(["0", "0"])
    expect(landed(result.table, depreciation!)["Akum. Penyusutan"]).toBe("0")
    expect(landed(result.table, depreciation!)["Nilai Buku"]).toBe("0")
  })

  it("umur WIP: total order tetap di kolom Umur (hari), Sisa WIP di kolom terakhir", () => {
    const table = buildWipAgingTable({
      report: {
        orders: [
          { documentNo: "WO-1", productName: "Pagar", workOrderDocumentNo: null, status: "in_progress", ageDays: 10, bucket: "d0_30", completionPercent: 50, wipAmount: 1000 } as never,
        ],
        buckets: [{ id: "d0_30", label: "0–30 hari", orderCount: 1, wipAmount: 1000 } as never],
        totalOrders: 1,
        totalWipAmount: 1000,
        largestOrderId: null,
      },
      periodCaption: "Per 31 Okt 2026",
      asOf: new Date(2026, 9, 31),
    })
    const totals = assertTrailing(table)
    expect(totals[0].cells).toEqual(["1", "", "", "1.000"])
    const cols = landed(table, totals[0])
    expect(cols["Umur (hari)"]).toBe("1")
    expect(cols["Sisa WIP"]).toContain("1.000")
  })

  it("harga pemasok: jumlah baris di label, tanpa angka semu di kolom Terendah", () => {
    const result = buildVendorPriceListing([
      { vendorName: "PT V", itemKey: "bsi", itemLabel: "BSI Busi", sku: "BSI", itemName: "Busi", minQty: 1, price: 500, effectiveDate: new Date(2026, 9, 5) } as never,
    ])
    const totals = totalsOf(result.table.rows)
    expect(totals).toHaveLength(1)
    expect(totals[0].label).toContain("1 baris")
    expect(totals[0].cells.every((c) => c === "")).toBe(true)
  })
})

describe("registry stok: slug ATAU id (BUGHUNT round2 #9)", () => {
  // Resolver kini query terindeks findFirst (slug -> id), bukan full scan
  // findMany + find di memori; mock meniru semantik where dari fixture.
  function wireResolverFixtures() {
    const items = [{ id: 7, slug: "busi-iridium" }]
    const warehouses = [{ id: 3, slug: "gudang-utama" }]
    mocks.prismaMock.item.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      const w = args.where
      return (
        items.find(
          (r) =>
            (typeof w.slug === "string" ? r.slug === w.slug : true) &&
            (typeof w.id === "number" ? r.id === w.id : true),
        ) ?? null
      )
    })
    mocks.prismaMock.warehouse.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      const w = args.where
      return (
        warehouses.find(
          (r) =>
            (typeof w.slug === "string" ? r.slug === w.slug : true) &&
            (typeof w.id === "number" ? r.id === w.id : true),
        ) ?? null
      )
    })
  }

  it("resolver barang/gudang menerima slug dan id, menolak tak dikenal", async () => {
    wireResolverFixtures()
    expect(await resolveItemIdBySlugOrId("busi-iridium")).toBe(7)
    expect(await resolveItemIdBySlugOrId("7")).toBe(7)
    expect(await resolveItemIdBySlugOrId("tidak-ada")).toBeNull()
    expect(await resolveItemIdBySlugOrId(null)).toBeNull()
    expect(await resolveWarehouseIdBySlugOrId("gudang-utama")).toBe(3)
    expect(await resolveWarehouseIdBySlugOrId("3")).toBe(3)
    // Full scan tak boleh kembali: resolver tak menyentuh findMany.
    expect(mocks.prismaMock.item.findMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.warehouse.findMany).not.toHaveBeenCalled()
  })

  it("kartu-stok PDF: slug barang diteruskan ke loader (dulu dibuang regex digit)", async () => {
    wireResolverFixtures()
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
    wireResolverFixtures()
    mocks.prismaMock.stockMove.findMany.mockResolvedValue([])
    const period = parseReportPeriod("2026-10", { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })
    await REPORTS["mutasi-stok"].load({ period, search: { gudang: "gudang-utama" } })
    expect(mocks.prismaMock.stockMove.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ warehouseId: 3 }) }),
    )
  })

  it("kartu-stok PDF: id numerik tetap jalan (kompat lama)", async () => {
    wireResolverFixtures()
    mocks.prismaMock.stockMove.findMany.mockResolvedValue([])
    const period = parseReportPeriod("2026-10", { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })
    await REPORTS["kartu-stok"].load({ period, search: { barang: "7" } })
    expect(mocks.prismaMock.stockMove.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ itemId: 7 }) }),
    )
  })
})
