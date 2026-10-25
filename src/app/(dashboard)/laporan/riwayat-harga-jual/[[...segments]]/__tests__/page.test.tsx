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
import {
  SALES_PRICE_HISTORY_ITEMLESS_LABEL,
  SALES_PRICE_HISTORY_NOTICE_TEXT,
  SALES_PRICE_HISTORY_UNKNOWN_SOURCE_LABEL,
  type SalesPriceHistory,
} from "@/lib/reports/sales-price-history"
import { renderPageNode, unmountCard } from "@/components/reports/__tests__/card-test-utils"

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
  jumlahTransaksi: 1,
  pasangan: [
    {
      customerId: 7,
      customerName: "PT Contoh",
      itemId: 42,
      itemName: "Busi Iridium",
      itemSku: "BSI-001",
      transaksiTerakhir: EVENT,
      jumlahTransaksi: 1,
      jumlahTampil: 1,
      terpotong: false,
      qtyKumulatif: 3,
      kejadian: [EVENT],
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
    expect(text).toContain("150.000")
    expect(text).toContain("10.000")
    expect(text).toContain("Baris Faktur Tanpa Barang")
    expect(container.querySelector('a[href="/penjualan/faktur/faktur-99"]')).not.toBeNull()
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
