import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  QUOTATION_PRICE_HISTORY_BUCKET_LABELS,
  QUOTATION_PRICE_HISTORY_CURRENT_REVISION_LABEL,
  QUOTATION_PRICE_HISTORY_MAX_EVENTS_PER_PAIR,
  QUOTATION_PRICE_HISTORY_MAX_PERIOD_DAYS,
  QUOTATION_PRICE_HISTORY_NOTICE_TEXT,
  buildQuotationPriceHistory,
  type QuotationPriceEventInput,
} from "../quotation-price-history"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  quotationFindMany: vi.fn(),
  itemFindMany: vi.fn(),
  quotationHistoryFindMany: vi.fn(),
  quotationUpdate: vi.fn(),
  quotationCreate: vi.fn(),
  quotationItemCreate: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: {
      findMany: (...a: unknown[]) => mocks.quotationFindMany(...a),
      update: (...a: unknown[]) => mocks.quotationUpdate(...a),
      create: (...a: unknown[]) => mocks.quotationCreate(...a),
    },
    item: { findMany: (...a: unknown[]) => mocks.itemFindMany(...a) },
    quotationHistory: {
      findMany: (...a: unknown[]) => mocks.quotationHistoryFindMany(...a),
    },
    quotationItem: { create: (...a: unknown[]) => mocks.quotationItemCreate(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getQuotationPriceHistory } from "../quotation-price-history-data"

// Hari kalender WIB tetap: 2026-10-25 — instan 05:00 WIB.
const NOW = new Date("2026-10-24T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)
const START = day(-30)
const END = day(1)

function event(overrides: Partial<QuotationPriceEventInput> = {}): QuotationPriceEventInput {
  return {
    quotationId: 1,
    quotationItemId: 11,
    slug: "quo-1",
    documentNo: "QUO/2026/001",
    revisionNumber: 0,
    customerId: 10,
    customerName: "PT Uji",
    itemId: 100,
    itemName: "Oli Mesin",
    itemSku: "SKU-OLI",
    description: null,
    date: day(-5),
    validUntil: day(10),
    status: "sent",
    qty: 2,
    uom: "PCS",
    unitPrice: 100_000,
    discount: 5_000,
    total: 190_000,
    ...overrides,
  }
}

describe("quotation-price-history builder (F-2026-10-25-039-S)", () => {
  it("notice BR-QPH-10 + penanda revisi berjalan + label ember verbatim", () => {
    expect(QUOTATION_PRICE_HISTORY_NOTICE_TEXT).toBe(
      "Harga penawaran lampau — bukan harga transaksi dan bukan harga jual saat ini. Harga draft belum pernah terkirim; harga ditolak/kedaluwarsa tidak disepakati pelanggan. Harga berlaku mengikuti daftar harga/master saat penawaran dibuat.",
    )
    expect(QUOTATION_PRICE_HISTORY_CURRENT_REVISION_LABEL).toBe("Revisi berjalan")
    expect(QUOTATION_PRICE_HISTORY_BUCKET_LABELS).toEqual({
      DRAFT: "DRAFT — BELUM TERKIRIM",
      TERKIRIM: "TERKIRIM",
      KEDALUWARSA: "KEDALUWARSA",
      DITERIMA: "DITERIMA",
      DITOLAK: "DITOLAK",
      DITOLAK_OTOMATIS: "DITOLAK OTOMATIS",
      DIKONVERSI: "DIKONVERSI",
      STATUS_TIDAK_DIKENAL: "Status tidak dikenal",
    })
    expect(QUOTATION_PRICE_HISTORY_MAX_PERIOD_DAYS).toBe(365)
    expect(QUOTATION_PRICE_HISTORY_MAX_EVENTS_PER_PAIR).toBe(50)

    const result = buildQuotationPriceHistory([], { periodeMulai: START, periodeSelesai: END, now: NOW })
    expect(result.notice).toBe(QUOTATION_PRICE_HISTORY_NOTICE_TEXT)
    expect(result.revisiBerjalanLabel).toBe("Revisi berjalan")
    expect(result.menyertakanDraft).toBe(false)
  })

  it("AC-QPH-B1: deletedAt terisi tidak mengubah keluaran walau harga ekstrem", () => {
    const live = event()
    const deleted = event({
      quotationId: 99,
      quotationItemId: 99,
      documentNo: "QUO/2026/099",
      date: day(-1),
      unitPrice: 999_999,
      deletedAt: day(-1),
    })
    const withDeleted = buildQuotationPriceHistory([live, deleted], {
      periodeMulai: START,
      periodeSelesai: END,
      now: NOW,
    })
    const withoutDeleted = buildQuotationPriceHistory([live], {
      periodeMulai: START,
      periodeSelesai: END,
      now: NOW,
    })
    expect(withDeleted).toEqual(withoutDeleted)
    expect(withDeleted.jumlahKejadian).toBe(1)
  })

  it("AC-QPH-B2: label ember persis per status; rejected/draft tidak pernah tanpa label", () => {
    const result = buildQuotationPriceHistory(
      [
        event({ quotationId: 1, quotationItemId: 1, documentNo: "QUO/1", status: "draft" }),
        event({ quotationId: 2, quotationItemId: 2, documentNo: "QUO/2", status: "sent", validUntil: day(5) }),
        event({ quotationId: 3, quotationItemId: 3, documentNo: "QUO/3", status: "accepted" }),
        event({ quotationId: 4, quotationItemId: 4, documentNo: "QUO/4", status: "approved" }),
        event({ quotationId: 5, quotationItemId: 5, documentNo: "QUO/5", status: "rejected" }),
        event({
          quotationId: 6,
          quotationItemId: 6,
          documentNo: "QUO/6",
          status: "rejected",
          autoRejected: true,
        }),
        event({ quotationId: 7, quotationItemId: 7, documentNo: "QUO/7", status: "converted" }),
      ],
      { periodeMulai: START, periodeSelesai: END, now: NOW, includeDraft: true },
    )
    const byQuotation = new Map(
      result.pasangan[0].kejadian.map((kejadian) => [kejadian.quotationId, kejadian]),
    )
    expect(byQuotation.get(1)?.emberLabel).toBe("DRAFT — BELUM TERKIRIM")
    expect(byQuotation.get(2)?.emberLabel).toBe("TERKIRIM")
    expect(byQuotation.get(3)?.emberLabel).toBe("DITERIMA")
    expect(byQuotation.get(4)?.emberLabel).toBe("DITERIMA")
    expect(byQuotation.get(5)?.emberLabel).toBe("DITOLAK")
    expect(byQuotation.get(6)?.emberLabel).toBe("DITOLAK OTOMATIS")
    expect(byQuotation.get(7)?.emberLabel).toBe("DIKONVERSI")
    for (const kejadian of result.pasangan[0].kejadian) {
      expect(kejadian.emberLabel.length).toBeGreaterThan(0)
      expect(kejadian.emberLabel).not.toMatch(/pasar|berlaku saat ini/i)
    }
    expect(result.pasangan[0].hitunganPerEmber).toEqual([
      { ember: "DRAFT", label: "DRAFT — BELUM TERKIRIM", count: 1 },
      { ember: "TERKIRIM", label: "TERKIRIM", count: 1 },
      { ember: "DITERIMA", label: "DITERIMA", count: 2 },
      { ember: "DITOLAK", label: "DITOLAK", count: 1 },
      { ember: "DITOLAK_OTOMATIS", label: "DITOLAK OTOMATIS", count: 1 },
      { ember: "DIKONVERSI", label: "DIKONVERSI", count: 1 },
    ])
    // BR-QPH-07: tidak ada penanda sumber harga karangan di baris.
    expect(result.pasangan[0].kejadian[0]).not.toHaveProperty("priceSource")
    expect(JSON.stringify(result)).not.toMatch(/priceSource|daftar harga sumber/i)
  })

  it("Q-QPH-4: DRAFT mati default, tampil hanya saringan eksplisit", () => {
    const draft = event({ status: "draft", unitPrice: 111 })
    const sent = event({ quotationId: 2, quotationItemId: 12, documentNo: "QUO/2", unitPrice: 222 })
    const defaultResult = buildQuotationPriceHistory([draft, sent], {
      periodeMulai: START,
      periodeSelesai: END,
      now: NOW,
    })
    expect(defaultResult.pasangan[0].jumlahKejadian).toBe(1)
    expect(defaultResult.pasangan[0].penawaranTerakhir.unitPrice).toBe(222)

    const explicitResult = buildQuotationPriceHistory([draft, sent], {
      periodeMulai: START,
      periodeSelesai: END,
      now: NOW,
      includeDraft: true,
    })
    expect(explicitResult.menyertakanDraft).toBe(true)
    expect(explicitResult.pasangan[0].jumlahKejadian).toBe(2)
  })

  it("AC-QPH-B3: kedaluwarsa turunan — kemarin KEDALUWARSA, hari ini TERKIRIM, kosong tidak pernah", () => {
    const result = buildQuotationPriceHistory(
      [
        event({ quotationId: 1, quotationItemId: 1, documentNo: "QUO/1", validUntil: day(-1) }),
        event({ quotationId: 2, quotationItemId: 2, documentNo: "QUO/2", validUntil: day(0) }),
        event({ quotationId: 3, quotationItemId: 3, documentNo: "QUO/3", validUntil: null }),
        // EC-8: status tersimpan menang — rejected + validUntil lewat = DITOLAK.
        event({ quotationId: 4, quotationItemId: 4, documentNo: "QUO/4", status: "rejected", validUntil: day(-1) }),
      ],
      { periodeMulai: START, periodeSelesai: END, now: NOW },
    )
    const byQuotation = new Map(
      result.pasangan[0].kejadian.map((kejadian) => [kejadian.quotationId, kejadian]),
    )
    expect(byQuotation.get(1)?.emberStatus).toBe("KEDALUWARSA")
    expect(byQuotation.get(1)?.kedaluwarsaTurunan).toBe(true)
    expect(byQuotation.get(2)?.emberStatus).toBe("TERKIRIM")
    expect(byQuotation.get(3)?.emberStatus).toBe("TERKIRIM")
    expect(byQuotation.get(4)?.emberStatus).toBe("DITOLAK")
    // Baca murni: status tersimpan input tidak diubah builder.
    expect(byQuotation.get(1)?.status).toBe("sent")
  })

  it("AC-QPH-B4/EC-1: penawaran terakhir = tanggal terbaru, seri documentNo lalu id — bukan rata-rata", () => {
    const result = buildQuotationPriceHistory(
      [
        event({ quotationId: 1, quotationItemId: 1, documentNo: "QUO/2026/001", date: day(-2), unitPrice: 100 }),
        event({ quotationId: 2, quotationItemId: 2, documentNo: "QUO/2026/003", date: day(-2), unitPrice: 300 }),
        event({ quotationId: 3, quotationItemId: 3, documentNo: "QUO/2026/002", date: day(-2), unitPrice: 200 }),
        event({ quotationId: 9, quotationItemId: 9, documentNo: "QUO/2026/003", date: day(-2), unitPrice: 400 }),
      ],
      { periodeMulai: START, periodeSelesai: END, now: NOW },
    )
    const pair = result.pasangan[0]
    // Tanggal sama: documentNo terbesar (003), lalu id quotation terbesar (9).
    expect(pair.penawaranTerakhir.quotationId).toBe(9)
    expect(pair.penawaranTerakhir.unitPrice).toBe(400)
    expect(pair.penawaranTerakhir.unitPrice).not.toBe((100 + 200 + 300 + 400) / 4)
    expect(pair.kejadian.map((k) => k.quotationId)).toEqual([9, 2, 3, 1])
  })

  it("AC-QPH-B5/Q-QPH-5: itemId NULL hanya hitungan ringkas tanpa-barang per pelanggan", () => {
    const result = buildQuotationPriceHistory(
      [
        event({ itemId: null, itemName: null, itemSku: null, description: "Jasa bebas", date: day(-10) }),
        event({
          quotationId: 2,
          quotationItemId: 12,
          documentNo: "QUO/2",
          itemId: null,
          itemName: null,
          itemSku: null,
          description: "Baris bebas lain",
          date: day(-3),
        }),
        event({ quotationId: 3, quotationItemId: 13, documentNo: "QUO/3" }),
      ],
      { periodeMulai: START, periodeSelesai: END, now: NOW },
    )
    expect(result.tanpaBarang).toEqual([
      {
        customerId: 10,
        customerName: "PT Uji",
        count: 2,
        tanggalTerawal: day(-10),
        tanggalTerbaru: day(-3),
      },
    ])
    expect(result.pasangan).toHaveLength(1)
    expect(result.pasangan[0].itemId).toBe(100)
    expect(JSON.stringify(result.tanpaBarang)).not.toContain("Jasa bebas")
  })

  it("Q-QPH-4: maks 50 kejadian/pasangan, terpotong tertanda, penawaranTerakhir tetap global periode", () => {
    const inputs = Array.from({ length: 55 }, (_, index) =>
      event({
        quotationId: index + 1,
        quotationItemId: index + 1,
        documentNo: `QUO/${String(index + 1).padStart(3, "0")}`,
        date: day(-index),
        unitPrice: index + 1,
      }),
    )
    const result = buildQuotationPriceHistory(inputs, {
      periodeMulai: day(-60),
      periodeSelesai: END,
      now: NOW,
    })
    const pair = result.pasangan[0]
    expect(pair.jumlahKejadian).toBe(55)
    expect(pair.jumlahTampil).toBe(50)
    expect(pair.kejadian).toHaveLength(50)
    expect(pair.terpotong).toBe(true)
    expect(result.terpotong).toBe(true)
    expect(pair.penawaranTerakhir.unitPrice).toBe(1)
    expect(pair.kejadian[49].unitPrice).toBe(50)
  })

  it("periode >365 hari ditolak; tepat 365 hari lolos (putusan Q-QPH-4)", () => {
    expect(() =>
      buildQuotationPriceHistory([], { periodeMulai: day(-366), periodeSelesai: day(0), now: NOW }),
    ).toThrow(/365 hari/)
    expect(() =>
      buildQuotationPriceHistory([], { periodeMulai: day(-365), periodeSelesai: day(0), now: NOW }),
    ).not.toThrow()
    expect(() =>
      buildQuotationPriceHistory([], { periodeMulai: day(0), periodeSelesai: day(-1), now: NOW }),
    ).toThrow(/mendahului/)
  })

  it("AC-QPH-B7: status asing tampil mentah tertanda tidak dikenal, tidak dipetakan paksa", () => {
    const result = buildQuotationPriceHistory([event({ status: "menunggu-gudang" })], {
      periodeMulai: START,
      periodeSelesai: END,
      now: NOW,
    })
    const kejadian = result.pasangan[0].kejadian[0]
    expect(kejadian.status).toBe("menunggu-gudang")
    expect(kejadian.emberStatus).toBe("STATUS_TIDAK_DIKENAL")
    expect(kejadian.emberLabel).toBe("Status tidak dikenal")
    expect(kejadian.statusTidakDikenal).toBe(true)
  })

  it("EC-6/EC-7: harga 0 tampil apa adanya; penawaranTerakhir hanya dalam periode", () => {
    const result = buildQuotationPriceHistory(
      [
        event({ date: day(-2), unitPrice: 0 }),
        event({ quotationId: 2, quotationItemId: 12, documentNo: "QUO/2", date: day(5), unitPrice: 777 }),
      ],
      { periodeMulai: START, periodeSelesai: END, now: NOW },
    )
    expect(result.pasangan[0].penawaranTerakhir.unitPrice).toBe(0)
    expect(result.pasangan[0].penawaranTerakhir.hargaNol).toBe(true)
    expect(result.pasangan[0].jumlahKejadian).toBe(1)
  })

  it("saringan itemId eksplisit membatasi pasangan; tanpaBarang tidak ikut tersaring", () => {
    const result = buildQuotationPriceHistory(
      [
        event(),
        event({ quotationId: 2, quotationItemId: 12, documentNo: "QUO/2", itemId: 200, itemName: "Filter", itemSku: "SKU-F" }),
        event({ quotationId: 3, quotationItemId: 13, documentNo: "QUO/3", itemId: null, itemName: null, itemSku: null }),
      ],
      { periodeMulai: START, periodeSelesai: END, now: NOW, itemId: 200 },
    )
    expect(result.itemId).toBe(200)
    expect(result.pasangan.map((pair) => pair.itemId)).toEqual([200])
    expect(result.tanpaBarang[0]?.count).toBe(1)
  })
})

function quotationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "quo-1",
    documentNo: "QUO/2026/001",
    revisionNumber: 2,
    customerId: 10,
    date: day(-5),
    validUntil: day(10),
    status: "sent",
    customer: { name: "PT Uji" },
    sections: [
      {
        items: [
          {
            id: 11,
            itemId: 100,
            description: null,
            uom: "PCS",
            qty: 2,
            unitPrice: 100_000,
            discount: 5_000,
            total: 190_000,
          },
          {
            id: 12,
            itemId: null,
            description: "Jasa bebas",
            uom: null,
            qty: 1,
            unitPrice: 50_000,
            discount: 0,
            total: 50_000,
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe("quotation-price-history loader (Q-QPH-2/3 fisik)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 1 })
    mocks.itemFindMany.mockResolvedValue([{ id: 100, name: "Oli Mesin", sku: "SKU-OLI" }])
    mocks.quotationHistoryFindMany.mockResolvedValue([])
  })

  it("AC-QPH-F2/B6: view_reports fail-closed sebelum query; massal anti-N+1; nol mutasi; snapshot tak dibaca", async () => {
    mocks.quotationFindMany.mockResolvedValue([
      quotationRow(),
      quotationRow({ id: 2, slug: "quo-2", documentNo: "QUO/2026/002" }),
    ])

    const result = await getQuotationPriceHistory(
      { customerId: 10, periodeMulai: START, periodeSelesai: END },
      NOW,
    )

    expect(mocks.requirePermission).toHaveBeenCalledTimes(1)
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.quotationFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.quotationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: 10,
          deletedAt: null,
          date: { gte: START, lte: END },
        }),
      }),
    )
    const quotationArgs = mocks.quotationFindMany.mock.calls[0][0] as {
      select: { sections: { select: { items: { select: Record<string, unknown> } } } }
    }
    // BR-QPH-07: select baris tidak meminta penanda sumber harga apa pun.
    expect(quotationArgs.select.sections.select.items.select).not.toHaveProperty("priceSource")
    expect(mocks.itemFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.itemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [100] } } }),
    )
    expect(mocks.quotationHistoryFindMany).toHaveBeenCalledTimes(1)
    const historyArgs = mocks.quotationHistoryFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>
      select: Record<string, unknown>
    }
    expect(historyArgs.where).toEqual({ quotationId: { in: [1, 2] }, action: "auto_rejected" })
    // Q-QPH-3: dataSnapshot tidak pernah diselect/dibaca tahap 1.
    expect(historyArgs.select).toEqual({ quotationId: true, revisionNumber: true })
    expect(historyArgs.select).not.toHaveProperty("dataSnapshot")
    expect(mocks.quotationUpdate).not.toHaveBeenCalled()
    expect(mocks.quotationCreate).not.toHaveBeenCalled()
    expect(mocks.quotationItemCreate).not.toHaveBeenCalled()

    expect(result.pasangan[0].itemName).toBe("Oli Mesin")
    expect(result.tanpaBarang[0].count).toBe(2)
    expect(result.jumlahKejadian).toBe(2)
  })

  it("izin ditolak: tidak ada query DB sama sekali", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("Tidak memiliki izin"))
    await expect(
      getQuotationPriceHistory({ customerId: 10, periodeMulai: START, periodeSelesai: END }, NOW),
    ).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.quotationFindMany).not.toHaveBeenCalled()
    expect(mocks.itemFindMany).not.toHaveBeenCalled()
  })

  it("DITOLAK OTOMATIS hanya histori auto_rejected revisi berjalan", async () => {
    mocks.quotationFindMany.mockResolvedValue([quotationRow({ status: "rejected" })])
    mocks.quotationHistoryFindMany.mockResolvedValue([{ quotationId: 1, revisionNumber: 2 }])
    const current = await getQuotationPriceHistory(
      { customerId: 10, periodeMulai: START, periodeSelesai: END },
      NOW,
    )
    expect(current.pasangan[0].kejadian[0].emberStatus).toBe("DITOLAK_OTOMATIS")

    mocks.quotationHistoryFindMany.mockResolvedValue([{ quotationId: 1, revisionNumber: 1 }])
    const stale = await getQuotationPriceHistory(
      { customerId: 10, periodeMulai: START, periodeSelesai: END },
      NOW,
    )
    expect(stale.pasangan[0].kejadian[0].emberStatus).toBe("DITOLAK")
  })

  it("saringan itemId diteruskan sebagai filter relasi massal, bukan query per baris", async () => {
    mocks.quotationFindMany.mockResolvedValue([quotationRow()])
    await getQuotationPriceHistory(
      { customerId: 10, periodeMulai: START, periodeSelesai: END, itemId: 100 },
      NOW,
    )
    expect(mocks.quotationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sections: { some: { items: { some: { itemId: 100 } } } },
        }),
      }),
    )
  })

  it("kosong: tanpa query pendamping bila tidak ada penawaran", async () => {
    mocks.quotationFindMany.mockResolvedValue([])
    const result = await getQuotationPriceHistory(
      { customerId: 10, periodeMulai: START, periodeSelesai: END },
      NOW,
    )
    expect(result.pasangan).toEqual([])
    expect(mocks.itemFindMany).not.toHaveBeenCalled()
    expect(mocks.quotationHistoryFindMany).not.toHaveBeenCalled()
  })

  it("periode >365 hari ditolak loader sebelum query", async () => {
    await expect(
      getQuotationPriceHistory(
        { customerId: 10, periodeMulai: day(-400), periodeSelesai: day(0) },
        NOW,
      ),
    ).rejects.toThrow(/365 hari/)
    expect(mocks.quotationFindMany).not.toHaveBeenCalled()
  })
})
