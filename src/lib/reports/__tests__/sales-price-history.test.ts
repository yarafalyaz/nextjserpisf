import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  SALES_PRICE_HISTORY_ITEMLESS_LABEL,
  SALES_PRICE_HISTORY_KNOWN_SOURCES,
  SALES_PRICE_HISTORY_MAX_EVENTS_PER_PAIR,
  SALES_PRICE_HISTORY_MAX_PERIOD_DAYS,
  SALES_PRICE_HISTORY_NOTICE_TEXT,
  SALES_PRICE_HISTORY_UNKNOWN_SOURCE_LABEL,
  buildSalesPriceHistory,
  deriveSalesPriceSourceLabel,
  type SalesPriceEventInput,
} from "../sales-price-history"

const mocks = vi.hoisted(() => ({
  salesInvoiceFindMany: vi.fn(),
  itemFindMany: vi.fn(),
  salesInvoiceUpdate: vi.fn(),
  salesInvoiceCreate: vi.fn(),
  salesInvoiceItemCreate: vi.fn(),
  salesInvoiceItemUpdate: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesInvoice: {
      findMany: (...a: unknown[]) => mocks.salesInvoiceFindMany(...a),
      update: (...a: unknown[]) => mocks.salesInvoiceUpdate(...a),
      create: (...a: unknown[]) => mocks.salesInvoiceCreate(...a),
    },
    salesInvoiceItem: {
      create: (...a: unknown[]) => mocks.salesInvoiceItemCreate(...a),
      update: (...a: unknown[]) => mocks.salesInvoiceItemUpdate(...a),
    },
    item: { findMany: (...a: unknown[]) => mocks.itemFindMany(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getSalesPriceHistory } from "../sales-price-history-data"

const START = new Date("2026-09-01T00:00:00.000Z")
const END = new Date("2026-10-25T23:59:59.000Z")
const day = (iso: string) => new Date(`${iso}T10:00:00.000Z`)

function event(overrides: Partial<SalesPriceEventInput> = {}): SalesPriceEventInput {
  return {
    invoiceId: 1,
    invoiceItemId: 11,
    slug: "inv-1",
    documentNo: "INV/2026/001",
    customerId: 10,
    customerName: "PT Uji",
    itemId: 100,
    itemName: "Oli Mesin",
    itemSku: "SKU-OLI",
    description: null,
    date: day("2026-10-20"),
    status: "posted",
    qty: 2,
    uom: "PCS",
    unitPrice: 100_000,
    discount: 5_000,
    total: 190_000,
    priceSource: "item_master",
    priceListId: null,
    priceListMinQty: null,
    ...overrides,
  }
}

describe("sales-price-history builder (F-2026-10-25-028-S)", () => {
  it("notice BR-PH-05 + label verbatim + batas putusan sejajar 039-S", () => {
    expect(SALES_PRICE_HISTORY_NOTICE_TEXT).toBe(
      "Harga transaksi lampau — bukan harga jual saat ini; harga berlaku mengikuti daftar harga/master saat penawaran dibuat.",
    )
    expect(SALES_PRICE_HISTORY_UNKNOWN_SOURCE_LABEL).toBe("Sumber harga tidak tercatat")
    expect(SALES_PRICE_HISTORY_ITEMLESS_LABEL).toBe("BARIS_TANPA_BARANG")
    expect(SALES_PRICE_HISTORY_KNOWN_SOURCES).toEqual(["price_list_tier", "price_list_base", "item_master"])
    expect(SALES_PRICE_HISTORY_MAX_PERIOD_DAYS).toBe(365)
    expect(SALES_PRICE_HISTORY_MAX_EVENTS_PER_PAIR).toBe(50)

    const result = buildSalesPriceHistory([], { periodeMulai: START, periodeSelesai: END })
    expect(result.notice).toBe(SALES_PRICE_HISTORY_NOTICE_TEXT)
    expect(result.pasangan).toEqual([])
    expect(result.tanpaBarang).toEqual([])
    expect(result.jumlahPasangan).toBe(0)
    expect(result.jumlahTransaksi).toBe(0)
    expect(result.terpotong).toBe(false)
  })

  it("AC-PH-B1: draft/sent/approved/cancelled/deletedAt TIDAK masuk walau unitPrice terisi", () => {
    const leaked = ["draft", "sent", "approved", "cancelled"].map((status, i) =>
      event({ status, invoiceId: 50 + i, invoiceItemId: 50 + i, unitPrice: 999_999 }),
    )
    const deleted = event({ invoiceId: 60, invoiceItemId: 60, deletedAt: day("2026-10-21"), unitPrice: 888_888 })
    const result = buildSalesPriceHistory([...leaked, deleted], { periodeMulai: START, periodeSelesai: END })
    expect(result.pasangan).toEqual([])
    expect(result.jumlahTransaksi).toBe(0)
  })

  it("AC-PH-B1: posted/partial/paid masuk; di luar periode tidak", () => {
    const result = buildSalesPriceHistory(
      [
        event({ status: "posted", invoiceId: 1, invoiceItemId: 1, date: day("2026-10-01") }),
        event({ status: "partial", invoiceId: 2, invoiceItemId: 2, date: day("2026-10-02") }),
        event({ status: "paid", invoiceId: 3, invoiceItemId: 3, date: day("2026-10-03") }),
        event({ status: "posted", invoiceId: 4, invoiceItemId: 4, date: day("2026-08-01") }),
      ],
      { periodeMulai: START, periodeSelesai: END },
    )
    expect(result.jumlahTransaksi).toBe(3)
    expect(result.pasangan[0].jumlahTransaksi).toBe(3)
  })

  it("AC-PH-B2/BR-PH-06: harga terakhir = baris terbaru persis, BUKAN rata-rata; seri tanggal diputus documentNo lalu id", () => {
    const result = buildSalesPriceHistory(
      [
        event({ invoiceId: 1, invoiceItemId: 1, documentNo: "INV/2026/001", date: day("2026-10-01"), unitPrice: 80_000, qty: 10 }),
        event({ invoiceId: 2, invoiceItemId: 2, documentNo: "INV/2026/002", date: day("2026-10-20"), unitPrice: 120_000, qty: 1 }),
        // Seri tanggal sama dengan di atas: documentNo lebih besar menang.
        event({ invoiceId: 3, invoiceItemId: 3, documentNo: "INV/2026/003", date: day("2026-10-20"), unitPrice: 130_000, qty: 1 }),
        // Seri documentNo sama: id faktur lebih besar menang.
        event({ invoiceId: 4, invoiceItemId: 4, documentNo: "INV/2026/003", date: day("2026-10-20"), unitPrice: 140_000, qty: 1 }),
      ],
      { periodeMulai: START, periodeSelesai: END },
    )
    const pair = result.pasangan[0]
    // Rata-rata tertimbang qty akan 84.615 — wajib BUKAN itu.
    expect(pair.transaksiTerakhir.unitPrice).toBe(140_000)
    expect(pair.transaksiTerakhir.invoiceId).toBe(4)
    // Satu sumber kebenaran: transaksi terakhir = baris pertama kejadian.
    expect(pair.transaksiTerakhir).toBe(pair.kejadian[0])
    expect(pair.kejadian.map((e) => e.invoiceId)).toEqual([4, 3, 2, 1])
    expect(pair.jumlahTransaksi).toBe(4)
    expect(pair.qtyKumulatif).toBe(13)
  })

  it("AC-PH-B3: priceSource null/asing tampil tidak-tercatat; kosakata sah memakai label existing", () => {
    expect(deriveSalesPriceSourceLabel({ priceSource: null, priceListMinQty: null })).toEqual({
      label: "Sumber harga tidak tercatat",
      tidakTercatat: true,
    })
    expect(deriveSalesPriceSourceLabel({ priceSource: "sumber_asing", priceListMinQty: null }).tidakTercatat).toBe(true)
    expect(deriveSalesPriceSourceLabel({ priceSource: "item_master", priceListMinQty: null })).toEqual({
      label: "Harga master",
      tidakTercatat: false,
    })
    expect(deriveSalesPriceSourceLabel({ priceSource: "price_list_base", priceListMinQty: null }).label).toBe(
      "Harga daftar",
    )
    // Tier tanpa minQty sah = snapshot tak lengkap, bukan dipetakan paksa.
    expect(deriveSalesPriceSourceLabel({ priceSource: "price_list_tier", priceListMinQty: null }).tidakTercatat).toBe(
      true,
    )
    expect(deriveSalesPriceSourceLabel({ priceSource: "price_list_tier", priceListMinQty: 10 }).label).toContain(
      "Daftar Harga",
    )

    const result = buildSalesPriceHistory([event({ priceSource: null })], {
      periodeMulai: START,
      periodeSelesai: END,
    })
    expect(result.pasangan[0].transaksiTerakhir.priceSourceLabel).toBe("Sumber harga tidak tercatat")
    expect(result.pasangan[0].transaksiTerakhir.sumberTidakTercatat).toBe(true)
    // Nilai mentah tetap terbawa untuk audit, tidak dipetakan ke item_master.
    expect(result.pasangan[0].transaksiTerakhir.priceSource).toBeNull()
  })

  it("AC-PH-B4: baris itemId null hanya ember BARIS_TANPA_BARANG per pelanggan, tanpa harga pasangan", () => {
    const result = buildSalesPriceHistory(
      [
        event({ itemId: null, itemName: null, itemSku: null, description: "Jasa bebas", date: day("2026-10-05") }),
        event({
          itemId: null,
          itemName: null,
          itemSku: null,
          description: "Jasa lain",
          invoiceId: 2,
          invoiceItemId: 12,
          date: day("2026-10-15"),
        }),
        event({}),
      ],
      { periodeMulai: START, periodeSelesai: END },
    )
    expect(result.tanpaBarang).toEqual([
      {
        label: "BARIS_TANPA_BARANG",
        customerId: 10,
        customerName: "PT Uji",
        count: 2,
        tanggalTerawal: day("2026-10-05"),
        tanggalTerbaru: day("2026-10-15"),
      },
    ])
    expect(result.pasangan).toHaveLength(1)
    expect(result.pasangan[0].itemId).toBe(100)
    expect(result.jumlahTransaksi).toBe(1)
  })

  it("AC-PH-B6: diskon baris terpisah dari unitPrice; harga 0 tertanda (EC-6)", () => {
    const result = buildSalesPriceHistory(
      [event({ unitPrice: 0, discount: 0, total: 0 }), event({ invoiceId: 2, invoiceItemId: 12, date: day("2026-10-21") })],
      { periodeMulai: START, periodeSelesai: END },
    )
    const [latest, bonus] = result.pasangan[0].kejadian
    expect(latest.unitPrice).toBe(100_000)
    expect(latest.discount).toBe(5_000)
    expect(latest.total).toBe(190_000)
    expect(bonus.hargaNol).toBe(true)
    expect(bonus.unitPrice).toBe(0)
  })

  it("saringan itemId + batas per pasangan ditandai terpotong", () => {
    const many = Array.from({ length: 55 }, (_, i) =>
      event({ invoiceId: i + 1, invoiceItemId: i + 1, date: new Date(START.getTime() + i * 86_400_000) }),
    )
    const result = buildSalesPriceHistory(many, { periodeMulai: START, periodeSelesai: END })
    expect(result.pasangan[0].jumlahTransaksi).toBe(55)
    expect(result.pasangan[0].jumlahTampil).toBe(50)
    expect(result.pasangan[0].terpotong).toBe(true)
    expect(result.terpotong).toBe(true)

    const filtered = buildSalesPriceHistory([event({}), event({ itemId: 200, invoiceItemId: 99 })], {
      periodeMulai: START,
      periodeSelesai: END,
      itemId: 200,
    })
    expect(filtered.pasangan).toHaveLength(1)
    expect(filtered.pasangan[0].itemId).toBe(200)
    expect(filtered.itemId).toBe(200)
  })

  it("pasangan terurut transaksi terakhir terbaru dulu; tautan detail faktur existing", () => {
    const result = buildSalesPriceHistory(
      [
        event({ itemId: 100, date: day("2026-10-01") }),
        event({ itemId: 200, itemName: "Ban", invoiceId: 2, invoiceItemId: 21, slug: null, date: day("2026-10-22") }),
      ],
      { periodeMulai: START, periodeSelesai: END },
    )
    expect(result.pasangan.map((p) => p.itemId)).toEqual([200, 100])
    expect(result.pasangan[0].transaksiTerakhir.tautanDetail).toBe("/penjualan/faktur/2")
    expect(result.pasangan[1].transaksiTerakhir.tautanDetail).toBe("/penjualan/faktur/inv-1")
  })

  it("gerbang periode: terbalik / >365 hari ditolak", () => {
    expect(() =>
      buildSalesPriceHistory([], { periodeMulai: END, periodeSelesai: START }),
    ).toThrow("mendahului periode mulai")
    expect(() =>
      buildSalesPriceHistory([], {
        periodeMulai: START,
        periodeSelesai: new Date(START.getTime() + 366 * 86_400_000),
      }),
    ).toThrow("melebihi batas maksimum 365 hari")
  })
})

describe("sales-price-history loader (F-2026-10-25-028-S)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.salesInvoiceFindMany.mockResolvedValue([])
    mocks.itemFindMany.mockResolvedValue([])
  })

  it("fail-closed: tanpa view_reports query tidak jalan (AC-PH-F2 lapis loader)", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(
      getSalesPriceHistory({ customerId: 10, periodeMulai: START, periodeSelesai: END }),
    ).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.salesInvoiceFindMany).not.toHaveBeenCalled()
  })

  it("query populasi BR-PH-01 persis + baca-saja nol mutasi (AC-PH-B1/B5)", async () => {
    await getSalesPriceHistory({ customerId: 10, periodeMulai: START, periodeSelesai: END, itemId: 100 })
    const arg = mocks.salesInvoiceFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({
      customerId: 10,
      status: { in: ["posted", "partial", "paid"] },
      deletedAt: null,
      date: { gte: START, lte: END },
      items: { some: { itemId: 100 } },
    })
    expect(mocks.salesInvoiceUpdate).not.toHaveBeenCalled()
    expect(mocks.salesInvoiceCreate).not.toHaveBeenCalled()
    expect(mocks.salesInvoiceItemCreate).not.toHaveBeenCalled()
    expect(mocks.salesInvoiceItemUpdate).not.toHaveBeenCalled()
  })

  it("pemetaan baris Prisma (Decimal-like Number()) + resolusi nama item massal", async () => {
    mocks.salesInvoiceFindMany.mockResolvedValue([
      {
        id: 7,
        slug: "inv-7",
        documentNo: "INV/2026/007",
        customerId: 10,
        date: day("2026-10-20"),
        status: "paid",
        deletedAt: null,
        customer: { name: "PT Uji" },
        items: [
          {
            id: 71,
            itemId: 100,
            description: null,
            uom: "PCS",
            qty: { valueOf: () => 2 },
            unitPrice: { valueOf: () => 100_000 },
            discount: { valueOf: () => 5_000 },
            total: { valueOf: () => 190_000 },
            priceSource: null,
            priceListId: null,
            priceListMinQty: null,
          },
          {
            id: 72,
            itemId: null,
            description: "Bebas",
            uom: null,
            qty: 1,
            unitPrice: 50_000,
            discount: 0,
            total: 50_000,
            priceSource: null,
            priceListId: null,
            priceListMinQty: null,
          },
        ],
      },
    ])
    // Number(Decimal) memakai valueOf; tiru kontrak Number() Prisma Decimal.
    mocks.itemFindMany.mockResolvedValue([{ id: 100, name: "Oli Mesin Kini", sku: "SKU-OLI" }])

    const result = await getSalesPriceHistory({ customerId: 10, periodeMulai: START, periodeSelesai: END })
    expect(mocks.itemFindMany).toHaveBeenCalledWith({
      where: { id: { in: [100] } },
      select: { id: true, name: true, sku: true },
    })
    expect(result.pasangan[0].itemName).toBe("Oli Mesin Kini")
    expect(result.pasangan[0].transaksiTerakhir.priceSourceLabel).toBe("Sumber harga tidak tercatat")
    expect(result.tanpaBarang[0].count).toBe(1)
  })
})
