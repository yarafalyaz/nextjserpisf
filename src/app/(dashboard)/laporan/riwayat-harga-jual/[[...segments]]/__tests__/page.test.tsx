// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  hasPermission: vi.fn(),
  getSalesPriceHistory: vi.fn(),
  customerFindMany: vi.fn(),
  itemFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
  hasPermission: mocks.hasPermission,
}))

vi.mock("@/lib/reports/sales-price-history-data", () => ({
  getSalesPriceHistory: mocks.getSalesPriceHistory,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customer: { findMany: mocks.customerFindMany },
    item: { findMany: mocks.itemFindMany },
  },
}))

vi.mock("@/components/reports/report-page-shell", () => ({
  ReportPageShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

vi.mock("@/components/reports/report-period-filter", () => ({
  ReportPeriodFilter: () => null,
}))

vi.mock("@/components/reports/export-buttons", () => ({
  ExportButtons: () => null,
}))

import SalesPriceHistoryPage from "../page"
import { formatAccounting, formatDate } from "@/lib/utils/format"
import {
  SALES_PRICE_HISTORY_ITEMLESS_LABEL,
  SALES_PRICE_HISTORY_NOTICE_TEXT,
  SALES_PRICE_HISTORY_UNKNOWN_SOURCE_LABEL,
  type SalesPriceHistory,
} from "@/lib/reports/sales-price-history"
import { renderPageNode, unmountCard } from "@/components/reports/__tests__/card-test-utils"

const EVENT_OLDER = {
  invoiceId: 98,
  invoiceItemId: 499,
  slug: "faktur-98",
  documentNo: "INV-2026-098",
  customerId: 7,
  customerName: "PT Contoh",
  itemId: 42,
  itemName: "Busi Iridium",
  itemSku: "BSI-001",
  description: null,
  date: new Date("2026-10-03T00:00:00Z"),
  status: "paid",
  qty: 2,
  uom: "pcs",
  unitPrice: 125_000,
  discount: 5_000,
  total: 240_000,
  priceSource: null,
  priceListId: null,
  priceListMinQty: null,
  priceSourceLabel: SALES_PRICE_HISTORY_UNKNOWN_SOURCE_LABEL,
  sumberTidakTercatat: true,
  hargaNol: false,
  tautanDetail: "/penjualan/faktur/faktur-98",
}

const EVENT = {
  invoiceId: 99,
  invoiceItemId: 500,
  slug: "faktur-99",
  documentNo: "INV-2026-099",
  customerId: 7,
  customerName: "PT Contoh",
  itemId: 42,
  itemName: "Busi Iridium",
  itemSku: "BSI-001",
  description: null,
  date: new Date("2026-10-10T00:00:00Z"),
  status: "paid",
  qty: 3,
  uom: "pcs",
  unitPrice: 150_000,
  discount: 10_000,
  total: 440_000,
  priceSource: null,
  priceListId: null,
  priceListMinQty: null,
  priceSourceLabel: SALES_PRICE_HISTORY_UNKNOWN_SOURCE_LABEL,
  sumberTidakTercatat: true,
  hargaNol: false,
  tautanDetail: "/penjualan/faktur/faktur-99",
}

const HISTORY: SalesPriceHistory = {
  notice: SALES_PRICE_HISTORY_NOTICE_TEXT,
  periodeMulai: new Date("2026-10-01T00:00:00Z"),
  periodeSelesai: new Date("2026-10-31T23:59:59Z"),
  itemId: null,
  terpotong: false,
  jumlahPasangan: 1,
  jumlahTransaksi: 2,
  pasangan: [
    {
      customerId: 7,
      customerName: "PT Contoh",
      itemId: 42,
      itemName: "Busi Iridium",
      itemSku: "BSI-001",
      transaksiTerakhir: EVENT,
      jumlahTransaksi: 2,
      jumlahTampil: 2,
      terpotong: false,
      qtyKumulatif: 5,
      kejadian: [EVENT, EVENT_OLDER],
    },
  ],
  tanpaBarang: [
    {
      label: SALES_PRICE_HISTORY_ITEMLESS_LABEL,
      customerId: 7,
      customerName: "PT Contoh",
      count: 4,
      tanggalTerawal: new Date("2026-10-02T00:00:00Z"),
      tanggalTerbaru: new Date("2026-10-20T00:00:00Z"),
    },
  ],
}

async function renderPage(segments: string[] = ["2026-10", "pelanggan", "pt-contoh"]) {
  const node = await SalesPriceHistoryPage({
    params: Promise.resolve({ segments }),
    searchParams: Promise.resolve({}),
  })
  return renderPageNode(node)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ name: "Admin", email: "admin@example.id" })
  mocks.hasPermission.mockResolvedValue(true)
  mocks.customerFindMany.mockResolvedValue([
    { id: 7, code: "CUST-007", name: "PT Contoh", slug: "pt-contoh" },
  ])
  mocks.itemFindMany.mockResolvedValue([
    { id: 42, name: "Busi Iridium", sku: "BSI-001", slug: "busi-iridium" },
  ])
  mocks.getSalesPriceHistory.mockResolvedValue(HISTORY)
})

afterEach(() => {
  document.body.replaceChildren()
})

describe("F-2026-10-25-028-S halaman Riwayat Harga Jual", () => {
  it("gerbang view_reports + notice/label verbatim server, diskon terpisah, tanpa hitung ulang UI", async () => {
    const { container, root } = await renderPage()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.getSalesPriceHistory).toHaveBeenCalledTimes(1)
    expect(mocks.getSalesPriceHistory).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 7, itemId: null }),
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Riwayat Harga Jual")
    expect(text).toContain(SALES_PRICE_HISTORY_NOTICE_TEXT)
    expect(text).toContain(SALES_PRICE_HISTORY_UNKNOWN_SOURCE_LABEL)
    expect(text).toContain(SALES_PRICE_HISTORY_ITEMLESS_LABEL)
    expect(text).toContain("INV-2026-099")
    expect(text).toContain("BSI-001")
    expect(text).toContain("Baris Faktur Tanpa Barang")
    expect(container.querySelector('a[href="/penjualan/faktur/faktur-99"]')).not.toBeNull()
    unmountCard(root)
  })

  it("harga verbatim per kejadian + harga terakhir: diskon tidak dikurangkan dari harga satuan", async () => {
    const { container, root } = await renderPage()
    const ringkasan = container.querySelector('[data-report-table="Harga Terakhir per Barang"]')
    const kejadian = container.querySelector('[data-report-table="Kejadian Harga BSI-001"]')
    expect(ringkasan).not.toBeNull()
    expect(kejadian).not.toBeNull()

    // Harga terakhir = unitPrice kejadian terbaru dari server, verbatim.
    // Baris: [Barang, Tanggal, No. Faktur, Sumber Harga, Harga Satuan Terakhir, Jumlah Transaksi]
    const ringkasanRow = ringkasan?.querySelectorAll("tbody tr")[0]
    expect(ringkasanRow?.children[1]?.textContent).toBe(formatDate(EVENT.date, { format: "short" }))
    expect(ringkasanRow?.children[4]?.textContent).toBe(formatAccounting(EVENT.unitPrice, { zeroDash: false }))
    expect(ringkasanRow?.children[4]?.textContent).toBe("150.000")
    // Sesudah-diskon terbaru (150.000 − 10.000) tidak boleh tampil sebagai harga satuan.
    expect(ringkasanRow?.children[4]?.textContent).not.toBe(
      formatAccounting(EVENT.unitPrice - EVENT.discount, { zeroDash: false }),
    )
    expect(ringkasan?.textContent ?? "").not.toContain("140.000")

    // Tiap kejadian verbatim: harga satuan + diskon terpisah, urutan server.
    // Baris: [Tanggal, No. Faktur, Sumber Harga, Qty, Satuan, Harga Satuan, Diskon Baris, Total Baris]
    const rows = kejadian?.querySelectorAll("tbody tr") ?? []
    expect(rows).toHaveLength(2)
    expect(rows[0]?.children[0]?.textContent).toBe(formatDate(EVENT.date, { format: "short" }))
    expect(rows[0]?.children[5]?.textContent).toBe("150.000")
    expect(rows[0]?.children[6]?.textContent).toBe("10.000")
    expect(rows[1]?.children[0]?.textContent).toBe(formatDate(EVENT_OLDER.date, { format: "short" }))
    expect(rows[1]?.children[5]?.textContent).toBe(formatAccounting(EVENT_OLDER.unitPrice, { zeroDash: false }))
    expect(rows[1]?.children[5]?.textContent).toBe("125.000")
    expect(rows[1]?.children[6]?.textContent).toBe("5.000")
    const kejadianText = kejadian?.textContent ?? ""
    expect(kejadianText).not.toContain("140.000")
    expect(kejadianText).not.toContain("120.000")
    unmountCard(root)
  })

  it("mutasi harga/tanggal objek builder mengalir verbatim tanpa ubah UI", async () => {
    const mutated: SalesPriceHistory = {
      ...HISTORY,
      pasangan: HISTORY.pasangan.map((pair) => ({
        ...pair,
        transaksiTerakhir: { ...EVENT, date: new Date("2026-10-25T00:00:00Z"), unitPrice: 175_000 },
        kejadian: [
          { ...EVENT, date: new Date("2026-10-25T00:00:00Z"), unitPrice: 175_000 },
          EVENT_OLDER,
        ],
      })),
    }
    mocks.getSalesPriceHistory.mockResolvedValue(mutated)
    const { container, root } = await renderPage()
    const ringkasanRow = container
      .querySelector('[data-report-table="Harga Terakhir per Barang"]')
      ?.querySelectorAll("tbody tr")[0]
    const expectedDate = formatDate(new Date("2026-10-25T00:00:00Z"), { format: "short" })
    expect(ringkasanRow?.children[1]?.textContent).toBe(expectedDate)
    expect(ringkasanRow?.children[4]?.textContent).toBe("175.000")
    const kejadianRows = container
      .querySelector('[data-report-table="Kejadian Harga BSI-001"]')
      ?.querySelectorAll("tbody tr")
    expect(kejadianRows?.[0]?.children[0]?.textContent).toBe(expectedDate)
    expect(kejadianRows?.[0]?.children[5]?.textContent).toBe("175.000")
    // Nilai fixture lama tidak lagi tampil di tabel harga.
    expect(
      container.querySelector('[data-report-table="Harga Terakhir per Barang"]')?.textContent ?? "",
    ).not.toContain("150.000")
    unmountCard(root)
  })

  it("tanpa izin faktur, nomor faktur tampil tanpa tautan", async () => {
    mocks.hasPermission.mockResolvedValue(false)
    const { container, root } = await renderPage()
    expect(mocks.hasPermission).toHaveBeenCalledWith("view_sales_invoices")
    expect(container.textContent ?? "").toContain("INV-2026-099")
    expect(container.querySelector('a[href="/penjualan/faktur/faktur-99"]')).toBeNull()
    unmountCard(root)
  })

  it("tanpa tombol pakai harga / label harga berlaku tambahan di luar notice", async () => {
    const { container, root } = await renderPage()
    const text = (container.textContent ?? "")
      .replace(SALES_PRICE_HISTORY_NOTICE_TEXT, "")
      .toLowerCase()
    expect(text).not.toContain("pakai harga ini")
    expect(text).not.toContain("harga pasar")
    expect(container.querySelector("button")).toBeNull()
    unmountCard(root)
  })

  it("tanpa pelanggan terpilih loader tidak dipanggil", async () => {
    const { container, root } = await renderPage([])
    expect(mocks.getSalesPriceHistory).not.toHaveBeenCalled()
    expect(container.textContent ?? "").toContain("Pilih pelanggan")
    unmountCard(root)
  })

  it("tanpa izin halaman gagal sebelum loader dipanggil", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("redirect:/"))
    await expect(
      SalesPriceHistoryPage({
        params: Promise.resolve({ segments: [] }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("redirect:/")
    expect(mocks.getSalesPriceHistory).not.toHaveBeenCalled()
  })

  it("periode melebihi batas loader tampil sebagai pesan, bukan crash", async () => {
    mocks.getSalesPriceHistory.mockRejectedValue(
      new Error("Periode riwayat harga jual melebihi batas maksimum 365 hari."),
    )
    const { container, root } = await renderPage()
    expect(container.textContent ?? "").toContain("melebihi batas maksimum 365 hari")
    unmountCard(root)
  })
})
