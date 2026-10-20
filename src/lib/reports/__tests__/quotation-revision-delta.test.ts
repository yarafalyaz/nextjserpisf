import { describe, it, expect, vi } from "vitest"

/**
 * Selisih revisi penawaran (F-2026-10-20-103 lapis aman).
 * Yang dijaga per vonis Salsa 22:38: sumber nilai tunggal grandTotal
 * berjalan vs snapshot revisi terakhir (sen integer), arah naik ->
 * jalur faktur selisih existing, turun -> kredit revisi-turun existing,
 * tetap/tanpa snapshot -> tanpa jalur. Read-only (notice eksplisit).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    quotation: { findUnique: vi.fn() },
    quotationHistory: { findFirst: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getQuotationRevisionDelta } from "../quotation-revision-delta-data"
import {
  buildQuotationRevisionDelta,
  QUOTATION_REVISION_DELTA_NOTICE,
} from "../quotation-revision-delta"

describe("buildQuotationRevisionDelta", () => {
  it("naik: selisih positif sen -> jalur faktur selisih", () => {
    const r = buildQuotationRevisionDelta({
      quotationId: 7,
      revisionNumber: 1,
      snapshotGrandTotal: 80_000_000,
      currentGrandTotal: 100_000_000,
    })
    expect(r.snapshotTotalCents).toBe(8_000_000_000)
    expect(r.currentTotalCents).toBe(10_000_000_000)
    expect(r.deltaCents).toBe(2_000_000_000)
    expect(r.direction).toBe("naik")
    expect(r.billingPath).toBe("difference-invoice")
    expect(r.notice).toBe(QUOTATION_REVISION_DELTA_NOTICE)
  })

  it("turun: selisih negatif -> jalur kredit revisi-turun", () => {
    const r = buildQuotationRevisionDelta({
      quotationId: 7,
      revisionNumber: 2,
      snapshotGrandTotal: 100_000_000.5,
      currentGrandTotal: 75_000_000.25,
    })
    expect(r.deltaCents).toBe(-2_500_000_025)
    expect(r.direction).toBe("turun")
    expect(r.billingPath).toBe("revision-down-credit")
  })

  it("tetap dan tanpa snapshot: tanpa jalur penagihan", () => {
    const tetap = buildQuotationRevisionDelta({
      quotationId: 7,
      revisionNumber: 1,
      snapshotGrandTotal: 50,
      currentGrandTotal: 50,
    })
    expect(tetap.direction).toBe("tetap")
    expect(tetap.billingPath).toBeNull()
    const kosong = buildQuotationRevisionDelta({
      quotationId: 7,
      revisionNumber: 0,
      snapshotGrandTotal: null,
      currentGrandTotal: 50,
    })
    expect(kosong.snapshotTotalCents).toBeNull()
    expect(kosong.deltaCents).toBeNull()
    expect(kosong.billingPath).toBeNull()
  })
})

describe("getQuotationRevisionDelta", () => {
  it("loader membaca snapshot terakhir dan grandTotal berjalan", async () => {
    mocks.prismaMock.quotation.findUnique.mockResolvedValue({
      id: 7,
      grandTotal: 120,
      revisionNumber: 3,
    })
    mocks.prismaMock.quotationHistory.findFirst.mockResolvedValue({
      revisionNumber: 2,
      dataSnapshot: { grandTotal: "100" },
    })
    const r = await getQuotationRevisionDelta(7)
    expect(r?.deltaCents).toBe(2000)
    expect(r?.revisionNumber).toBe(2)
    expect(mocks.prismaMock.quotationHistory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { quotationId: 7, action: "revised" },
        orderBy: [{ revisionNumber: "desc" }, { id: "desc" }],
      }),
    )
  })

  it("penawaran tidak ada -> null; snapshot rusak -> tanpa snapshot", async () => {
    mocks.prismaMock.quotation.findUnique.mockResolvedValue(null)
    await expect(getQuotationRevisionDelta(9)).resolves.toBeNull()
    mocks.prismaMock.quotation.findUnique.mockResolvedValue({
      id: 7,
      grandTotal: 10,
      revisionNumber: 1,
    })
    mocks.prismaMock.quotationHistory.findFirst.mockResolvedValue({
      revisionNumber: 1,
      dataSnapshot: { grandTotal: "bukan-angka" },
    })
    const r = await getQuotationRevisionDelta(7)
    expect(r?.snapshotTotalCents).toBeNull()
    expect(r?.deltaCents).toBeNull()
  })
})
