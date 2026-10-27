import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  TAX_INVOICE_DRAFT_DIRECTION_LABELS,
  TAX_INVOICE_DRAFT_LEVEL_LABELS,
  TAX_INVOICE_DRAFT_NOTICE_TEXT,
  TAX_INVOICE_DRAFT_PAST_PERIOD_LABEL,
  TAX_INVOICE_DRAFT_STALE_DAYS,
  TAX_INVOICE_DRAFT_TITLE,
  buildTaxInvoiceDraftQueue,
  type TaxInvoiceDraftInput,
} from "../tax-invoice-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  taxInvoiceFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { taxInvoice: { findMany: (...a: unknown[]) => mocks.taxInvoiceFindMany(...a) } },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getTaxInvoiceDraftQueue } from "../tax-invoice-draft-queue-data"

const NOW = new Date("2026-10-25T22:00:00.000Z") // 2026-10-26 WIB
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(overrides: Partial<TaxInvoiceDraftInput> = {}): TaxInvoiceDraftInput {
  return {
    taxInvoiceId: 1,
    slug: "fp-1",
    direction: "out",
    djpStatus: "draft",
    transactionCode: "04",
    taxInvoiceNumber: "0400026000000001",
    taxInvoiceDate: day(-1),
    taxPeriod: "2026-10",
    dpp: 1_000_000,
    taxRate: 11,
    taxAmount: 110_000,
    counterpartyName: "Lawan Uji",
    creditStatus: null,
    replacesId: null,
    createdAt: day(-1),
    ...overrides,
  }
}

describe("tax-invoice-draft-queue (F-2026-10-27-098-S)", () => {
  it("kata verbatim Q-TIQ-2 + ambang Q-TIQ-1", () => {
    expect(TAX_INVOICE_DRAFT_STALE_DAYS).toBe(3)
    expect(TAX_INVOICE_DRAFT_TITLE).toBe("Faktur Pajak Draft")
    expect(TAX_INVOICE_DRAFT_DIRECTION_LABELS).toEqual({ out: "Keluaran", in: "Masukan" })
    expect(TAX_INVOICE_DRAFT_LEVEL_LABELS).toEqual({ mengendap: "Mengendap", menunggu: "Menunggu" })
    expect(TAX_INVOICE_DRAFT_PAST_PERIOD_LABEL).toBe("masa lampau")
    expect(TAX_INVOICE_DRAFT_NOTICE_TEXT).not.toMatch(/terlambat|kewajiban/i)
  })

  it("AC-TIQ-B1: hanya draft out/in; status/arah liar keluar; ember terpisah", () => {
    const queue = buildTaxInvoiceDraftQueue(
      [
        input({ taxInvoiceId: 1, direction: "out" }),
        input({ taxInvoiceId: 2, direction: "in", creditStatus: "uncredited" }),
        input({ taxInvoiceId: 3, djpStatus: "approved" }),
        input({ taxInvoiceId: 4, djpStatus: "cancelled" }),
        input({ taxInvoiceId: 5, direction: "asing" }),
        input({ taxInvoiceId: 6, djpStatus: "status-liar" }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.taxInvoiceId)).toEqual([1, 2])
    expect(queue.directionCounts).toEqual({ out: 1, in: 1 })
    expect(queue.rows[1].creditStatus).toBe("uncredited")
  })

  it("AC-TIQ-B2: payload tanpa xmlPayload/xmlHash/djpMessage", () => {
    const queue = buildTaxInvoiceDraftQueue([input()], NOW)
    const serialized = JSON.stringify(queue)
    expect(serialized).not.toContain("xmlPayload")
    expect(serialized).not.toContain("xmlHash")
    expect(serialized).not.toContain("djpMessage")
  })

  it("AC-TIQ-B4: umur dari createdAt (bukan taxInvoiceDate); tepat 3 mengendap; urutan seri id", () => {
    const queue = buildTaxInvoiceDraftQueue(
      [
        input({ taxInvoiceId: 2, createdAt: day(-3), taxInvoiceDate: day(-30) }),
        input({ taxInvoiceId: 1, createdAt: day(-3), taxInvoiceDate: day(0) }),
        input({ taxInvoiceId: 3, createdAt: day(-1) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.taxInvoiceId)).toEqual([1, 2, 3])
    expect(queue.rows[0].ageDays).toBe(3)
    expect(queue.rows[0].level).toBe("mengendap")
    expect(queue.rows[2].level).toBe("menunggu")
  })

  it("Q-TIQ-3: taxPeriod lampau tertanda netral; masa berjalan tidak", () => {
    const queue = buildTaxInvoiceDraftQueue(
      [
        input({ taxInvoiceId: 1, taxPeriod: "2026-09" }),
        input({ taxInvoiceId: 2, taxPeriod: "2026-10" }),
      ],
      NOW,
    )
    expect(queue.currentPeriod).toBe("2026-10")
    expect(queue.rows.find((r) => r.taxInvoiceId === 1)?.pastPeriodLabel).toBe("masa lampau")
    expect(queue.rows.find((r) => r.taxInvoiceId === 2)?.pastPeriodLabel).toBeNull()
  })

  it("AC-TIQ-B3: nominal snapshot verbatim tanpa hitung ulang", () => {
    const queue = buildTaxInvoiceDraftQueue(
      [input({ dpp: 123_456, taxRate: 11, taxAmount: 999 })],
      NOW,
    )
    expect(queue.rows[0].dpp).toBe(123_456)
    expect(queue.rows[0].taxAmount).toBe(999)
  })
})

describe("getTaxInvoiceDraftQueue (loader fail-closed)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.taxInvoiceFindMany.mockResolvedValue([])
  })

  it("AC-TIQ-B3/B5: tanpa izin menolak sebelum query", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getTaxInvoiceDraftQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("create_tax_invoices")
    expect(mocks.taxInvoiceFindMany).not.toHaveBeenCalled()
  })

  it("select daftar-putih tanpa kolom XML/pesan DJP", async () => {
    await getTaxInvoiceDraftQueue({ now: NOW })
    const arg = mocks.taxInvoiceFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ djpStatus: "draft" })
    const keys = Object.keys(arg.select)
    expect(keys).not.toContain("xmlPayload")
    expect(keys).not.toContain("xmlHash")
    expect(keys).not.toContain("djpMessage")
    expect(keys).toContain("counterpartyName")
  })
})
