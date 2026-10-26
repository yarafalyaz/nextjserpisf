// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getQuotationPriceHistory: vi.fn(),
  customerFindMany: vi.fn(),
  itemFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/reports/quotation-price-history-data", () => ({
  getQuotationPriceHistory: mocks.getQuotationPriceHistory,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customer: { findMany: mocks.customerFindMany },
    item: { findMany: mocks.itemFindMany },
  },
}))

vi.mock("@/components/reports/report-page-shell", async () =>
  (await import("@/components/reports/__tests__/card-test-utils")).reportPageShellModule,
)

vi.mock("@/components/reports/report-period-filter", () => ({
  ReportPeriodFilter: () => null,
}))

vi.mock("@/components/reports/export-buttons", () => ({
  ExportButtons: () => null,
}))

import QuotationPriceHistoryPage from "../page"
import {
  QUOTATION_PRICE_HISTORY_NOTICE_TEXT,
  type QuotationPriceHistory,
} from "@/lib/reports/quotation-price-history"
import { renderPageNode, unmountCard } from "@/components/reports/__tests__/card-test-utils"

const HISTORY: QuotationPriceHistory = {
  notice: QUOTATION_PRICE_HISTORY_NOTICE_TEXT,
  revisiBerjalanLabel: "Revisi berjalan",
  periodeMulai: new Date("2026-10-01T00:00:00Z"),
  periodeSelesai: new Date("2026-10-31T23:59:59Z"),
  menyertakanDraft: false,
  itemId: null,
  terpotong: false,
  jumlahPasangan: 1,
  jumlahKejadian: 1,
  pasangan: [
    {
      customerId: 7,
      customerName: "PT Contoh",
      itemId: 42,
      itemName: "Busi Iridium",
      itemSku: "BSI-001",
      penawaranTerakhir: {
        quotationId: 99,
        quotationItemId: 500,
        slug: "penawaran-99",
        documentNo: "QUO-2026-099",
        revisionNumber: 2,
        customerId: 7,
        customerName: "PT Contoh",
        itemId: 42,
        itemName: "Busi Iridium",
        itemSku: "BSI-001",
        description: null,
        date: new Date("2026-10-10T00:00:00Z"),
        validUntil: null,
        status: "sent",
        qty: 3,
        uom: "pcs",
        unitPrice: 150_000,
        discount: 10_000,
        total: 440_000,
        emberStatus: "TERKIRIM",
        emberLabel: "TERKIRIM",
        statusTidakDikenal: false,
        kedaluwarsaTurunan: false,
        hargaNol: false,
        tautanDetail: "/penjualan/penawaran/penawaran-99",
      },
      jumlahKejadian: 1,
      jumlahTampil: 1,
      terpotong: false,
      hitunganPerEmber: [{ ember: "TERKIRIM", label: "TERKIRIM", count: 1 }],
      kejadian: [],
    },
  ],
  // Ember tanpa-barang hanya hitungan ringkas (Q-QPH-5) — tanpa daftar baris.
  tanpaBarang: [
    {
      customerId: 7,
      customerName: "PT Contoh",
      count: 4,
      tanggalTerawal: new Date("2026-10-02T00:00:00Z"),
      tanggalTerbaru: new Date("2026-10-20T00:00:00Z"),
    },
  ],
}

HISTORY.pasangan[0].kejadian = [HISTORY.pasangan[0].penawaranTerakhir]

async function renderPage(segments: string[] = ["2026-10", "pelanggan", "pt-contoh"]) {
  const node = await QuotationPriceHistoryPage({
    params: Promise.resolve({ segments }),
    searchParams: Promise.resolve({}),
  })
  return renderPageNode(node)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ name: "Admin", email: "admin@example.id" })
  mocks.customerFindMany.mockResolvedValue([
    { id: 7, code: "CUST-007", name: "PT Contoh", slug: "pt-contoh" },
  ])
  mocks.itemFindMany.mockResolvedValue([
    { id: 42, name: "Busi Iridium", sku: "BSI-001", slug: "busi-iridium" },
  ])
  mocks.getQuotationPriceHistory.mockResolvedValue(HISTORY)
})

afterEach(() => {
  document.body.replaceChildren()
})

describe("F-2026-10-25-039-S halaman Riwayat Harga Penawaran (AC-QPH-F)", () => {
  it("gerbang view_reports + notice/label verbatim server, tanpa hitung ulang UI", async () => {
    const { container, root } = await renderPage()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.getQuotationPriceHistory).toHaveBeenCalledTimes(1)
    expect(mocks.getQuotationPriceHistory).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 7, includeDraft: false, itemId: null }),
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Riwayat Harga Penawaran")
    expect(text).toContain(QUOTATION_PRICE_HISTORY_NOTICE_TEXT)
    expect(text).toContain("Revisi berjalan")
    expect(text).toContain("QUO-2026-099")
    expect(text).toContain("TERKIRIM")
    expect(text).toContain("BSI-001")
    // Harga/angka ditempel dari payload server apa adanya.
    expect(text).toContain("150.000")
    // Tanpa-barang hanya hitungan ringkas.
    expect(text).toContain("Baris Penawaran Tanpa Barang")
    unmountCard(root)
  })

  it("tanpa label harga berlaku/pasar dan tanpa tombol pakai harga (BR-QPH-09, AC-QPH-F3)", async () => {
    const { container, root } = await renderPage()
    // Notice BR-QPH-10 verbatim server memang memuat frasa "Harga berlaku
    // mengikuti daftar harga/master..." — yang dilarang AC-QPH-F3 adalah
    // label UI tambahan di luar notice itu.
    const text = (container.textContent ?? "")
      .replace(QUOTATION_PRICE_HISTORY_NOTICE_TEXT, "")
      .toLowerCase()
    expect(text).not.toContain("harga berlaku")
    expect(text).not.toContain("harga pasar")
    expect(text).not.toContain("harga saat ini")
    expect(text).not.toContain("pakai harga ini")
    expect(container.querySelector("button")).toBeNull()
    unmountCard(root)
  })

  it("tanpa pelanggan terpilih loader tidak dipanggil (BR-QPH-12)", async () => {
    const { container, root } = await renderPage([])
    expect(mocks.getQuotationPriceHistory).not.toHaveBeenCalled()
    expect(container.textContent ?? "").toContain("Pilih pelanggan")
    unmountCard(root)
  })

  it("sakelar draft eksplisit diteruskan ke loader (Q-QPH-4)", async () => {
    const { root } = await renderPage(["2026-10", "pelanggan", "pt-contoh", "draft", "1"])
    expect(mocks.getQuotationPriceHistory).toHaveBeenCalledWith(
      expect.objectContaining({ includeDraft: true }),
    )
    unmountCard(root)
  })

  it("tanpa izin halaman gagal sebelum loader dipanggil", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("redirect:/"))
    await expect(
      QuotationPriceHistoryPage({
        params: Promise.resolve({ segments: [] }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("redirect:/")
    expect(mocks.getQuotationPriceHistory).not.toHaveBeenCalled()
  })

  it("periode melebihi batas loader tampil sebagai pesan, bukan crash", async () => {
    mocks.getQuotationPriceHistory.mockRejectedValue(
      new Error("Periode riwayat harga penawaran melebihi batas maksimum 365 hari."),
    )
    const { container, root } = await renderPage()
    expect(container.textContent ?? "").toContain("melebihi batas maksimum 365 hari")
    unmountCard(root)
  })
})
