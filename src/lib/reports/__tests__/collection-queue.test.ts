import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  COLLECTION_QUEUE_NOTICE_TEXT,
  COLLECTION_QUEUE_TITLE,
  COLLECTION_STAGE_LABELS,
  buildCollectionQueue,
  type CollectionExchangeInput,
  type CollectionFollowUpInput,
  type CollectionInvoiceInput,
} from "../collection-queue"
import { validateCollectionFollowUpInput } from "../collection-followup-validation"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  findInvoices: vi.fn(),
  findExchangeItems: vi.fn(),
  findFollowUps: vi.fn(),
  findLateFees: vi.fn(),
  findReturns: vi.fn(),
  findJournals: vi.fn(),
  getSystemSettings: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...args: unknown[]) => mocks.requirePermission(...args),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesInvoice: { findMany: (...a: unknown[]) => mocks.findInvoices(...a) },
    invoiceExchangeItem: {
      findMany: (...a: unknown[]) => mocks.findExchangeItems(...a),
    },
    invoiceCollectionFollowUp: {
      findMany: (...a: unknown[]) => mocks.findFollowUps(...a),
    },
    salesLateFee: {
      findMany: (...a: unknown[]) => mocks.findLateFees(...a),
    },
    salesReturn: {
      findMany: (...a: unknown[]) => mocks.findReturns(...a),
    },
    journal: {
      findMany: (...a: unknown[]) => mocks.findJournals(...a),
    },
  },
}))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: (...a: unknown[]) => mocks.getSystemSettings(...a),
}))

import { getCollectionQueue } from "../collection-queue-data"

// Hari kalender WIB tetap: 2026-10-22.
const NOW = new Date("2026-10-21T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function invoice(
  overrides: Partial<CollectionInvoiceInput> = {},
): CollectionInvoiceInput {
  return {
    invoiceId: 1,
    documentNo: "INV-1",
    status: "posted",
    deletedAt: null,
    date: day(-10),
    dueDate: day(5),
    grandTotal: 1_000_000,
    paidAmount: 0,
    customerId: 21,
    customerName: "Pelanggan Uji",
    customerPhone: "0812000000",
    contactPerson: "Budi",
    ...overrides,
  }
}

function exchange(
  overrides: Partial<CollectionExchangeInput> = {},
): CollectionExchangeInput {
  return {
    salesInvoiceId: 1,
    exchangeId: 7,
    exchangeDocumentNo: "TKF-7",
    exchangeDate: day(-3),
    dueDate: day(4),
    exchangeDeletedAt: null,
    ...overrides,
  }
}

function followUp(
  overrides: Partial<CollectionFollowUpInput> = {},
): CollectionFollowUpInput {
  return {
    salesInvoiceId: 1,
    followedUpAt: day(-2),
    outcome: "terhubung_janji_bayar",
    promisedDate: day(3),
    deletedAt: null,
    ...overrides,
  }
}

describe("collection-queue (F-2026-10-22-089-S)", () => {
  it("kata tampil verbatim spec §6", () => {
    expect(COLLECTION_QUEUE_TITLE).toBe("Antrean Penagihan Piutang")
    expect(COLLECTION_STAGE_LABELS).toEqual({
      belum_diserahkan: "Belum Diserahkan",
      sudah_diserahkan: "Sudah Diserahkan",
      lewat_janji: "Lewat Janji",
    })
    expect(COLLECTION_QUEUE_NOTICE_TEXT).toBe(
      "Tahap dan umur dihitung dari faktur, tukar faktur, dan janji bayar terakhir. Mencatat tindak lanjut tidak mencatat pembayaran dan tidak membuat jurnal.",
    )
  })

  it("F-104-V: returnCredit kurangi sisa antrean; lunas oleh retur keluar antrean", () => {
    const partial = buildCollectionQueue([invoice({ returnCredit: 400_000 })], [], [], { now: NOW })
    expect(partial.rows).toHaveLength(1)
    expect(partial.rows[0].sisa).toBe(600_000)
    const settled = buildCollectionQueue([invoice({ returnCredit: 1_000_000 })], [], [], { now: NOW })
    expect(settled.rows).toHaveLength(0)
    const plain = buildCollectionQueue([invoice()], [], [], { now: NOW })
    expect(plain.rows[0].sisa).toBe(1_000_000)
  })

  it("AC-COL-1: tanpa exchange BELUM_DISERAHKAN; sesudah exchange SUDAH_DISERAHKAN", () => {
    const before = buildCollectionQueue([invoice()], [], [], { now: NOW })
    expect(before.rows).toHaveLength(1)
    expect(before.rows[0].tahap).toBe("belum_diserahkan")
    expect(before.rows[0].exchangeDocumentNo).toBeNull()

    const after = buildCollectionQueue([invoice()], [exchange()], [], {
      now: NOW,
    })
    expect(after.rows[0].tahap).toBe("sudah_diserahkan")
    expect(after.rows[0].exchangeDocumentNo).toBe("TKF-7")
    expect(after.rows[0].dueAcuan).toEqual(day(4))
  })

  it("AC-COL-3: janji kemarin LEWAT_JANJI; janji besok keluar; janji maksimum menang", () => {
    const lewat = buildCollectionQueue(
      [invoice()],
      [],
      [followUp({ promisedDate: day(-1) })],
      { now: NOW },
    )
    expect(lewat.rows[0].tahap).toBe("lewat_janji")
    expect(lewat.rows[0].promiseDate).toEqual(day(-1))

    const besok = buildCollectionQueue(
      [invoice()],
      [exchange()],
      [
        followUp({ promisedDate: day(-1) }),
        followUp({ followedUpAt: day(-1), promisedDate: day(1) }),
      ],
      { now: NOW },
    )
    expect(besok.rows[0].promiseDate).toEqual(day(1))
    expect(besok.rows[0].tahap).toBe("sudah_diserahkan")
  })

  it("AC-COL-3b: tanpa janji, due acuan lewat = LEWAT_JANJI", () => {
    const q = buildCollectionQueue(
      [invoice({ dueDate: day(-2) })],
      [],
      [],
      { now: NOW },
    )
    expect(q.rows[0].tahap).toBe("lewat_janji")
    expect(q.rows[0].umurHari).toBe(2)
  })

  it("AC-COL-4: lunas/draft/cancelled/deleted keluar antrean", () => {
    const q = buildCollectionQueue(
      [
        invoice({ invoiceId: 1, paidAmount: 1_000_000 }),
        invoice({ invoiceId: 2, status: "draft" }),
        invoice({ invoiceId: 3, status: "cancelled" }),
        invoice({ invoiceId: 4, deletedAt: day(-1) }),
        invoice({ invoiceId: 5, paidAmount: 999_999.996 }),
        invoice({ invoiceId: 6, documentNo: "INV-6" }),
      ],
      [],
      [],
      { now: NOW },
    )
    expect(q.rows.map((r) => r.invoiceId)).toEqual([6])
  })

  it("AC-COL-5: tanpa due apa pun tampil, umur null, bukan lewat_janji dari due", () => {
    const q = buildCollectionQueue(
      [invoice({ dueDate: null })],
      [],
      [],
      { now: NOW },
    )
    expect(q.rows).toHaveLength(1)
    expect(q.rows[0].umurHari).toBeNull()
    expect(q.rows[0].dueAcuan).toBeNull()
    expect(q.rows[0].tahap).toBe("belum_diserahkan")
  })

  it("AC-COL-6: exchange terhapus = belum diserahkan; ganda aktif satu baris acuan terakhir", () => {
    const deleted = buildCollectionQueue(
      [invoice()],
      [exchange({ exchangeDeletedAt: day(-1) })],
      [],
      { now: NOW },
    )
    expect(deleted.rows[0].tahap).toBe("belum_diserahkan")

    const ganda = buildCollectionQueue(
      [invoice()],
      [
        exchange({ exchangeId: 7, exchangeDate: day(-5), dueDate: day(9) }),
        exchange({
          exchangeId: 8,
          exchangeDocumentNo: "TKF-8",
          exchangeDate: day(-1),
          dueDate: day(2),
        }),
      ],
      [],
      { now: NOW },
    )
    expect(ganda.rows).toHaveLength(1)
    expect(ganda.rows[0].exchangeDocumentNo).toBe("TKF-8")
    expect(ganda.rows[0].dueAcuan).toEqual(day(2))
  })

  it("AC-COL-12 (builder): janji menurut promisedDate maksimum, bukan urutan input", () => {
    const q = buildCollectionQueue(
      [invoice()],
      [exchange()],
      [
        followUp({ followedUpAt: day(-1), promisedDate: day(5) }),
        followUp({ followedUpAt: day(-3), promisedDate: day(2) }),
      ],
      { now: NOW },
    )
    expect(q.rows[0].promiseDate).toEqual(day(5))
    expect(q.rows[0].lastFollowUpAt).toEqual(day(-1))
  })

  it("tindak lanjut terhapus tidak menentukan janji/terakhir", () => {
    const q = buildCollectionQueue(
      [invoice()],
      [],
      [followUp({ promisedDate: day(-9), deletedAt: day(-1) })],
      { now: NOW },
    )
    expect(q.rows[0].promiseDate).toBeNull()
    expect(q.rows[0].lastFollowUpAt).toBeNull()
    expect(q.rows[0].tahap).toBe("belum_diserahkan")
  })

  it("Q-COL-3 urutan: lewat janji tertua, lalu due terdekat, lalu sisa terbesar", () => {
    const q = buildCollectionQueue(
      [
        invoice({ invoiceId: 1, documentNo: "A", dueDate: day(2), grandTotal: 500 }),
        invoice({ invoiceId: 2, documentNo: "B", dueDate: day(-10), grandTotal: 100 }),
        invoice({ invoiceId: 3, documentNo: "C", dueDate: day(-3), grandTotal: 100 }),
        invoice({ invoiceId: 4, documentNo: "D", dueDate: day(2), grandTotal: 900 }),
        invoice({ invoiceId: 5, documentNo: "E", dueDate: day(1), grandTotal: 100 }),
      ],
      [],
      [],
      { now: NOW },
    )
    expect(q.rows.map((r) => r.documentNo)).toEqual(["B", "C", "E", "D", "A"])
  })

  it("sisa presisi sen + ringkasan", () => {
    const q = buildCollectionQueue(
      [
        invoice({ invoiceId: 1, grandTotal: 100.1, paidAmount: 0.02 }),
        invoice({ invoiceId: 2, documentNo: "B", grandTotal: 200.2, paidAmount: 0.03 }),
      ],
      [],
      [],
      { now: NOW },
    )
    expect(q.rows.find((r) => r.invoiceId === 1)?.sisa).toBe(100.08)
    expect(q.summary.totalSisa).toBe(300.25)
    expect(q.summary.total).toBe(2)
  })
})

describe("collection-followup-validation (Q-COL-2, AC-COL-11)", () => {
  const base = {
    salesInvoiceId: 1,
    followedUpAt: "2026-10-22",
    channel: "whatsapp",
    outcome: "terhubung_janji_bayar",
    promisedDate: "2026-10-25",
    promisedAmount: 500_000,
  }

  it("valid: janji >= tindak lanjut, nominal > 0 lolos presisi sen", () => {
    const v = validateCollectionFollowUpInput(base)
    expect(v.channel).toBe("whatsapp")
    expect(v.promisedAmount).toBe(500_000)
    expect(v.promisedDate?.toISOString().slice(0, 10)).toBe("2026-10-25")
  })

  it("channel/outcome di luar kosakata ditolak", () => {
    expect(() =>
      validateCollectionFollowUpInput({ ...base, channel: "sms" }),
    ).toThrow("Kanal tindak lanjut tidak dikenal.")
    expect(() =>
      validateCollectionFollowUpInput({ ...base, outcome: "janji" }),
    ).toThrow("Hasil tindak lanjut tidak dikenal.")
  })

  it("AC-COL-11: promisedDate sebelum followedUpAt ditolak; nominal <= 0 ditolak", () => {
    expect(() =>
      validateCollectionFollowUpInput({ ...base, promisedDate: "2026-10-21" }),
    ).toThrow("Tanggal janji bayar tidak boleh sebelum tanggal tindak lanjut.")
    expect(() =>
      validateCollectionFollowUpInput({ ...base, promisedAmount: 0 }),
    ).toThrow("Nominal janji bayar harus lebih dari 0.")
    expect(() =>
      validateCollectionFollowUpInput({ ...base, promisedAmount: -5 }),
    ).toThrow("Nominal janji bayar harus lebih dari 0.")
  })

  it("outcome janji wajib tanggal; outcome lain dilarang tanggal janji", () => {
    expect(() =>
      validateCollectionFollowUpInput({ ...base, promisedDate: null }),
    ).toThrow("Hasil janji bayar wajib membawa tanggal janji bayar.")
    expect(() =>
      validateCollectionFollowUpInput({
        ...base,
        outcome: "tidak_terhubung",
        promisedDate: "2026-10-25",
        promisedAmount: null,
      }),
    ).toThrow("Tanggal janji bayar hanya untuk hasil terhubung dengan janji bayar.")
  })

  it("tanggal tak-kalender ditolak", () => {
    expect(() =>
      validateCollectionFollowUpInput({ ...base, followedUpAt: "2026-02-30" }),
    ).toThrow("bukan tanggal kalender")
  })
})

describe("collection-queue-data loader (AC-COL-7)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.findInvoices.mockResolvedValue([])
    mocks.findExchangeItems.mockResolvedValue([])
    mocks.findFollowUps.mockResolvedValue([])
    mocks.findLateFees.mockResolvedValue([])
    mocks.findReturns.mockResolvedValue([])
    mocks.findJournals.mockResolvedValue([])
    mocks.getSystemSettings.mockResolvedValue({ salesReceivableAccountId: 110 })
  })

  it("kedua izin ditegakkan sebelum query", async () => {
    await getCollectionQueue({ now: NOW })
    expect(mocks.requirePermission.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      "view_reports",
      "view_sales_invoices",
    ])
    expect(mocks.findInvoices).toHaveBeenCalledTimes(1)
  })

  it("izin pertama ditolak = query tidak jalan (fail-closed)", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("NEXT_REDIRECT"))
    await expect(getCollectionQueue({ now: NOW })).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.findInvoices).not.toHaveBeenCalled()
  })

  it("izin kedua ditolak = query tidak jalan", async () => {
    mocks.requirePermission
      .mockResolvedValueOnce({ id: "1" })
      .mockRejectedValueOnce(new Error("NEXT_REDIRECT"))
    await expect(getCollectionQueue({ now: NOW })).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.findInvoices).not.toHaveBeenCalled()
  })

  it("loader memetakan angka + relasi ke builder", async () => {
    mocks.findInvoices.mockResolvedValue([
      {
        id: 9,
        documentNo: "INV-9",
        status: "posted",
        deletedAt: null,
        date: day(-5),
        dueDate: day(3),
        grandTotal: 750000.5,
        paidAmount: 0,
        customerId: 3,
        customer: { name: "PT Uji", phone: "081", contactPerson: null },
      },
    ])
    const q = await getCollectionQueue({ now: NOW })
    expect(q.rows).toHaveLength(1)
    expect(q.rows[0].sisa).toBe(750000.5)
    expect(q.rows[0].customerPhone).toBe("081")
    expect(mocks.findLateFees).toHaveBeenCalledTimes(1)
  })

  it("loader memetakan denda terbit ke indikator baris (F-093-V)", async () => {
    mocks.findInvoices.mockResolvedValue([
      {
        id: 9,
        documentNo: "INV-9",
        status: "posted",
        deletedAt: null,
        date: day(-5),
        dueDate: day(3),
        grandTotal: 750000.5,
        paidAmount: 0,
        customerId: 3,
        customer: { name: "PT Uji", phone: "081", contactPerson: null },
      },
    ])
    mocks.findLateFees.mockResolvedValue([
      {
        salesInvoiceId: 9,
        amount: 50000,
        paidAmount: 10000,
        status: "partial",
        reversesId: null,
      },
    ])
    const q = await getCollectionQueue({ now: NOW })
    expect(q.rows[0].lateFeeOutstanding).toBe(40000)
    expect(q.rows[0].hasOutstandingLateFee).toBe(true)
  })
})
