import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  ACCEPTED_QUOTATION_AGE_UNRECORDED_LABEL,
  ACCEPTED_QUOTATION_QUEUE_NOTICE_TEXT,
  ACCEPTED_QUOTATION_STAGE_LABELS,
  ACCEPTED_QUOTATION_STALE_DAYS,
  buildAcceptedQuotationQueue,
  type AcceptedQuotationInput,
} from "../quotation-accepted-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  quotationFindMany: vi.fn(),
  salesOrderFindMany: vi.fn(),
  workOrderFindMany: vi.fn(),
  salesInvoiceFindMany: vi.fn(),
  downPaymentFindMany: vi.fn(),
  quotationHistoryFindMany: vi.fn(),
  quotationUpdate: vi.fn(),
  quotationCreate: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: {
      findMany: (...a: unknown[]) => mocks.quotationFindMany(...a),
      update: (...a: unknown[]) => mocks.quotationUpdate(...a),
      create: (...a: unknown[]) => mocks.quotationCreate(...a),
    },
    salesOrder: { findMany: (...a: unknown[]) => mocks.salesOrderFindMany(...a) },
    workOrder: { findMany: (...a: unknown[]) => mocks.workOrderFindMany(...a) },
    salesInvoice: { findMany: (...a: unknown[]) => mocks.salesInvoiceFindMany(...a) },
    downPayment: { findMany: (...a: unknown[]) => mocks.downPaymentFindMany(...a) },
    quotationHistory: {
      findMany: (...a: unknown[]) => mocks.quotationHistoryFindMany(...a),
    },
  },
}))

import { getAcceptedQuotationQueue } from "../quotation-accepted-queue-data"

// Hari kalender WIB tetap: 2026-10-25 — instan 05:00 WIB.
const NOW = new Date("2026-10-24T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(overrides: Partial<AcceptedQuotationInput> = {}): AcceptedQuotationInput {
  return {
    quotationId: 1,
    slug: "quo-1",
    documentNo: "QUO/2026/001",
    status: "accepted",
    customerId: 10,
    customerName: "PT Uji",
    phone: null,
    contactPerson: null,
    salesEmployeeId: 7,
    salesEmployeeName: "Sales Uji",
    customerVehicleLabel: "B 1234 CD · Avanza",
    date: day(-10),
    validUntil: day(10),
    grandTotal: 1000,
    acceptedAt: day(-1),
    salesOrders: [],
    workOrders: [],
    salesInvoices: [],
    downPayments: [],
    ...overrides,
  }
}

describe("quotation-accepted-queue builder (F-2026-10-25-002-S)", () => {
  it("konstanta ambang + label + notice verbatim putusan", () => {
    expect(ACCEPTED_QUOTATION_STALE_DAYS).toBe(3)
    expect(ACCEPTED_QUOTATION_STAGE_LABELS).toEqual({
      MASA_BERLAKU_LEWAT: "Masa Berlaku Lewat",
      MENGENDAP: "Mengendap",
      MENUNGGU_TINDAK_LANJUT: "Menunggu Tindak Lanjut",
      PERNAH_DIKONVERSI_SO_BATAL: "Pernah Dikonversi — SO Dibatalkan",
    })
    expect(ACCEPTED_QUOTATION_AGE_UNRECORDED_LABEL).toBe("tidak tercatat")
    expect(ACCEPTED_QUOTATION_QUEUE_NOTICE_TEXT).toBe(
      "Antrean penawaran yang sudah diterima pelanggan tetapi belum menjadi pesanan penjualan. Uang muka, order kerja, atau faktur yang tertaut langsung bukan bukti konversi ke pesanan penjualan.",
    )
  })

  it("AC-AQ-B1: accepted tanpa SO masuk; SO aktif tertaut mengeluarkan baris", () => {
    const rows = buildAcceptedQuotationQueue(
      [
        input({ quotationId: 1 }),
        input({
          quotationId: 2,
          documentNo: "QUO/2026/002",
          salesOrders: [{ id: 9, documentNo: "SO/1", status: "draft" }],
        }),
      ],
      NOW,
    )
    expect(rows.map((r) => r.quotationId)).toEqual([1])
  })

  it("tahap umur: <=3 MENUNGGU, >3 MENGENDAP (Q-AQ-2)", () => {
    const rows = buildAcceptedQuotationQueue(
      [
        input({ quotationId: 1, acceptedAt: day(-3) }),
        input({ quotationId: 2, documentNo: "QUO/2026/002", acceptedAt: day(-4) }),
        input({ quotationId: 3, documentNo: "QUO/2026/003", acceptedAt: day(0) }),
      ],
      NOW,
    )
    expect(rows.find((r) => r.quotationId === 1)?.tahap).toBe("MENUNGGU_TINDAK_LANJUT")
    expect(rows.find((r) => r.quotationId === 1)?.umurTerimaHari).toBe(3)
    expect(rows.find((r) => r.quotationId === 2)?.tahap).toBe("MENGENDAP")
    expect(rows.find((r) => r.quotationId === 2)?.umurTerimaHari).toBe(4)
    expect(rows.find((r) => r.quotationId === 3)?.umurTerimaHari).toBe(0)
  })

  it("AC-AQ-B3/EC-1: SO hanya cancelled tertanda pernah-dikonversi, bukan MENUNGGU biasa", () => {
    const [row] = buildAcceptedQuotationQueue(
      [
        input({
          salesOrders: [{ id: 9, documentNo: "SO/1", status: "cancelled" }],
          acceptedAt: day(-1),
        }),
      ],
      NOW,
    )
    expect(row.tahap).toBe("PERNAH_DIKONVERSI_SO_BATAL")
    expect(row.tahapLabel).toBe("Pernah Dikonversi — SO Dibatalkan")
    expect(row.pernahDikonversiSoBatal).toBe(true)
    expect(row.punyaSoAktif).toBe(false)
  })

  it("AC-AQ-B4: umur dari acceptedAt; acceptedAt null = tidak tercatat, bukan 0", () => {
    const [recorded, unrecorded] = buildAcceptedQuotationQueue(
      [
        input({ quotationId: 1, acceptedAt: day(-10) }),
        input({ quotationId: 2, documentNo: "QUO/2026/002", acceptedAt: null }),
      ],
      NOW,
    )
    // MENGENDAP (id 1) terurut sebelum MENUNGGU tak tercatat (id 2).
    expect(recorded.quotationId).toBe(1)
    expect(recorded.umurTerimaHari).toBe(10)
    expect(recorded.umurTerimaLabel).toBe("10")
    expect(unrecorded.umurTerimaHari).toBeNull()
    expect(unrecorded.umurTerimaLabel).toBe("tidak tercatat")
    expect(unrecorded.tahap).toBe("MENUNGGU_TINDAK_LANJUT")
  })

  it("AC-AQ-B5/EC-2/EC-4: validUntil kemarin lewat, hari ini belum, kosong TANPA_BATAS", () => {
    const rows = buildAcceptedQuotationQueue(
      [
        input({ quotationId: 1, validUntil: day(-1), acceptedAt: day(-1) }),
        input({ quotationId: 2, documentNo: "QUO/2026/002", validUntil: day(0) }),
        input({ quotationId: 3, documentNo: "QUO/2026/003", validUntil: null, acceptedAt: day(-30) }),
      ],
      NOW,
    )
    const byId = new Map(rows.map((r) => [r.quotationId, r]))
    expect(byId.get(1)?.tahap).toBe("MASA_BERLAKU_LEWAT")
    expect(byId.get(1)?.sisaHari).toBe(-1)
    expect(byId.get(1)?.masaBerlakuLewat).toBe(true)
    expect(byId.get(2)?.masaBerlakuLewat).toBe(false)
    expect(byId.get(2)?.sisaHari).toBe(0)
    expect(byId.get(3)?.tanpaBatas).toBe(true)
    expect(byId.get(3)?.sisaHari).toBeNull()
    expect(byId.get(3)?.tahap).toBe("MENGENDAP")
  })

  it("AC-AQ-B6: DP pending/confirmed fakta pendamping saja, tahap tidak berubah", () => {
    const [withDp] = buildAcceptedQuotationQueue(
      [
        input({
          acceptedAt: day(-1),
          downPayments: [
            { id: 1, documentNo: "DP/1", status: "pending", amount: 100 },
            { id: 2, documentNo: "DP/2", status: "confirmed", amount: 900 },
          ],
        }),
      ],
      NOW,
    )
    expect(withDp.tahap).toBe("MENUNGGU_TINDAK_LANJUT")
    expect(withDp.dpPendingCount).toBe(1)
    expect(withDp.dpPendingTotal).toBe(100)
    expect(withDp.dpConfirmedCount).toBe(1)
    expect(withDp.dpConfirmedTotal).toBe(900)
  })

  it("AC-AQ-B7/EC-3: WO/invoice tertaut tanpa SO tetap di antrean, bukan label konversi", () => {
    const [row] = buildAcceptedQuotationQueue(
      [
        input({
          workOrders: [{ id: 5, documentNo: "WO/1", status: "in_progress" }],
          salesInvoices: [{ id: 6, documentNo: "INV/1", status: "posted" }],
        }),
      ],
      NOW,
    )
    expect(row.punyaWorkOrderTertaut).toBe(true)
    expect(row.punyaSalesInvoiceTertaut).toBe(true)
    expect(row.punyaSoAktif).toBe(false)
    expect(row.tahap).not.toBe("PERNAH_DIKONVERSI_SO_BATAL")
    expect(row.tahapLabel).not.toContain("Dikonversi")
  })

  it("urutan BR-AQ-06: lewat dulu, MENGENDAP umur terbesar, MENUNGGU umur terbesar, seri documentNo/id", () => {
    const rows = buildAcceptedQuotationQueue(
      [
        input({ quotationId: 5, documentNo: "QUO/2026/005", acceptedAt: day(-2) }),
        input({ quotationId: 4, documentNo: "QUO/2026/004", acceptedAt: day(-9) }),
        input({ quotationId: 3, documentNo: "QUO/2026/003", acceptedAt: day(-20), validUntil: day(-1) }),
        input({ quotationId: 2, documentNo: "QUO/2026/002", acceptedAt: day(-5) }),
        input({ quotationId: 1, documentNo: "QUO/2026/001", acceptedAt: day(-1) }),
        input({
          quotationId: 6,
          documentNo: "QUO/2026/006",
          acceptedAt: day(-1),
          salesOrders: [{ id: 9, documentNo: "SO/1", status: "cancelled" }],
        }),
        input({ quotationId: 8, documentNo: "QUO/2026/008", acceptedAt: day(-9) }),
        input({ quotationId: 7, documentNo: "QUO/2026/007", acceptedAt: day(-9) }),
      ],
      NOW,
    )
    expect(rows.map((r) => r.quotationId)).toEqual([3, 4, 7, 8, 2, 5, 1, 6])
  })
})

function quotationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "quo-1",
    documentNo: "QUO/2026/001",
    status: "accepted",
    revisionNumber: 2,
    customerId: 10,
    salesEmployeeId: 7,
    date: day(-10),
    validUntil: day(10),
    grandTotal: 1000,
    // updatedAt sengaja dibuat BARU: loader tidak boleh memakainya (AC-AQ-B4).
    updatedAt: day(0),
    customer: { name: "PT Uji", phone: "0812", contactPerson: "Budi" },
    salesEmployee: { name: "Sales Uji" },
    customerVehicle: { plateNumber: "B 1234 CD", vehicle: { name: "Avanza" } },
    ...overrides,
  }
}

describe("quotation-accepted-queue loader (Q-AQ-3 fisik)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.salesOrderFindMany.mockResolvedValue([])
    mocks.workOrderFindMany.mockResolvedValue([])
    mocks.salesInvoiceFindMany.mockResolvedValue([])
    mocks.downPaymentFindMany.mockResolvedValue([])
    mocks.quotationHistoryFindMany.mockResolvedValue([])
  })

  it("AC-AQ-B2/B6: saringan massal accepted/approved + deletedAt null; nol tulis", async () => {
    mocks.quotationFindMany.mockResolvedValue([quotationRow()])
    mocks.quotationHistoryFindMany.mockResolvedValue([
      { quotationId: 1, revisionNumber: 2, createdAt: day(-6) },
    ])

    const rows = await getAcceptedQuotationQueue(NOW)

    expect(mocks.quotationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["accepted", "approved"] }, deletedAt: null },
      }),
    )
    for (const fn of [
      mocks.salesOrderFindMany,
      mocks.workOrderFindMany,
      mocks.salesInvoiceFindMany,
      mocks.downPaymentFindMany,
      mocks.quotationHistoryFindMany,
    ]) {
      expect(fn).toHaveBeenCalledTimes(1)
    }
    expect(mocks.salesOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ quotationId: { in: [1] } }) }),
    )
    expect(mocks.quotationUpdate).not.toHaveBeenCalled()
    expect(mocks.quotationCreate).not.toHaveBeenCalled()
    expect(rows).toHaveLength(1)
    expect(rows[0].umurTerimaHari).toBe(6)
    expect(rows[0].tahap).toBe("MENGENDAP")
    expect(rows[0].customerVehicleLabel).toBe("B 1234 CD · Avanza")
  })

  it("AC-AQ-B4: updatedAt baru tidak mengnolkan umur (sumber = history, bukan updatedAt)", async () => {
    mocks.quotationFindMany.mockResolvedValue([quotationRow({ updatedAt: day(0) })])
    mocks.quotationHistoryFindMany.mockResolvedValue([
      { quotationId: 1, revisionNumber: 2, createdAt: day(-10) },
    ])

    const [row] = await getAcceptedQuotationQueue(NOW)
    expect(row.umurTerimaHari).toBe(10)
  })

  it("EC-5/EC-7: history revisi lama diabaikan; tanpa history revisi berjalan = tidak tercatat", async () => {
    mocks.quotationFindMany.mockResolvedValue([quotationRow({ revisionNumber: 3 })])
    mocks.quotationHistoryFindMany.mockResolvedValue([
      { quotationId: 1, revisionNumber: 1, createdAt: day(-20) },
    ])

    const [row] = await getAcceptedQuotationQueue(NOW)
    expect(row.umurTerimaHari).toBeNull()
    expect(row.umurTerimaLabel).toBe("tidak tercatat")
  })

  it("history accepted terakhir revisi berjalan dipakai (urutan desc dari query)", async () => {
    mocks.quotationFindMany.mockResolvedValue([quotationRow()])
    mocks.quotationHistoryFindMany.mockResolvedValue([
      { quotationId: 1, revisionNumber: 2, createdAt: day(-2) },
      { quotationId: 1, revisionNumber: 2, createdAt: day(-8) },
    ])

    const [row] = await getAcceptedQuotationQueue(NOW)
    expect(row.umurTerimaHari).toBe(2)
  })

  it("AC-AQ-B1 loader: SO aktif mengeluarkan; AC-AQ-B3: SO cancelled tertanda", async () => {
    mocks.quotationFindMany.mockResolvedValue([
      quotationRow({ id: 1 }),
      quotationRow({ id: 2, documentNo: "QUO/2026/002", slug: "quo-2" }),
    ])
    mocks.salesOrderFindMany.mockResolvedValue([
      { id: 9, documentNo: "SO/1", status: "draft", quotationId: 1 },
      { id: 10, documentNo: "SO/2", status: "cancelled", quotationId: 2 },
    ])
    mocks.quotationHistoryFindMany.mockResolvedValue([
      { quotationId: 2, revisionNumber: 2, createdAt: day(-1) },
    ])

    const rows = await getAcceptedQuotationQueue(NOW)
    expect(rows.map((r) => r.quotationId)).toEqual([2])
    expect(rows[0].tahap).toBe("PERNAH_DIKONVERSI_SO_BATAL")
  })

  it("kosong: tanpa query pendamping bila tidak ada quotation", async () => {
    mocks.quotationFindMany.mockResolvedValue([])
    const rows = await getAcceptedQuotationQueue(NOW)
    expect(rows).toEqual([])
    expect(mocks.salesOrderFindMany).not.toHaveBeenCalled()
  })
})
