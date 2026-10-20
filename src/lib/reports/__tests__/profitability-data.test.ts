import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * R-13: cakupan HPP berbasis kuantitas dengan alokasi proporsional.
 *
 * Dulu `loadProfitability` menandai baris stok "ber-HPP" hanya dari keberadaan
 * move (`movedInvoiceItems` boolean Set): keluar 3 dari jual 10 sudah terbaca
 * ber-HPP penuh, jadi 100% pendapatannya lolos dari peringatan "tanpa HPP"
 * padahal HPP-nya baru menutup 30%. Sekarang:
 *
 * - Qty faktur diagregat per (faktur, barang) — SKU berulang dijumlah.
 * - Qty keluar diagregat dari move OUT `posted` (query yang sama dengan HPP).
 * - Baris ber-HPP penuh hanya bila `movedQty >= invoicedQty - 1e-9`.
 * - Pendapatan belum ter-cover masuk `stockRevenueWithoutCogs` proporsional:
 *   jual 10 keluar 3 → 70% revenue garis itu, diatribusikan per baris SKU
 *   supaya total konsisten antar dimensi barang/faktur/pelanggan.
 * - `revenueLinesWithoutCogs` menghitung garis (faktur, barang) sekali.
 *
 * Mock `stockMove.findMany` menghormati filter `where` yang dikirim pemanggil,
 * jadi move reversed / impact IN dalam fixture benar-benar tersaring oleh
 * query — bukan sekadar tidak dibaca.
 */

const mocks = vi.hoisted(() => {
  const salesInvoiceFindMany = vi.fn()
  const stockMoveFindMany = vi.fn()
  const itemFindMany = vi.fn()

  return { salesInvoiceFindMany, stockMoveFindMany, itemFindMany }
})

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesInvoice: { findMany: mocks.salesInvoiceFindMany },
    stockMove: {
      findMany: async (args: any) => {
        mocks.stockMoveFindMany(args)
        const where = args?.where ?? {}
        return ALL_MOVES.filter(
          (move) =>
            (where.referenceType === undefined || move.referenceType === where.referenceType) &&
            (where.referenceId?.in === undefined || where.referenceId.in.includes(move.referenceId)) &&
            (where.impact === undefined || move.impact === where.impact) &&
            (where.status === undefined || move.status === where.status),
        )
      },
    },
    item: { findMany: mocks.itemFindMany },
  },
}))

import { loadProfitability, QTY_EPSILON } from "@/lib/reports/profitability-data"

const PERIOD = {
  start: new Date("2026-10-01T00:00:00.000Z"),
  end: new Date("2026-10-31T23:59:59.000Z"),
}

type MoveFixture = {
  referenceType: string
  referenceId: number
  itemId: number
  qty: number
  cost: number
  impact: string
  status: string
}

const ALL_MOVES: MoveFixture[] = []

function move(overrides: Partial<MoveFixture> & { referenceId: number; itemId: number }): MoveFixture {
  return {
    referenceType: "SalesInvoice",
    qty: 0,
    cost: 100,
    impact: "OUT",
    status: "posted",
    ...overrides,
  }
}

function invoice(overrides: {
  id?: number
  documentNo?: string
  customerId?: number
  customerName?: string
  items: { itemId: number | null; description?: string | null; qty: number; total: number }[]
}) {
  return {
    id: overrides.id ?? 1,
    documentNo: overrides.documentNo ?? "INV-001",
    customerId: overrides.customerId ?? 9,
    customer: { name: overrides.customerName ?? "Toko Maju" },
    items: overrides.items.map((item) => ({ description: null, ...item })),
  }
}

const STOCK_ITEM = { id: 5, sku: "BRG-1", name: "Busi", isService: false }
const SERVICE_ITEM = { id: 6, sku: "JSA-1", name: "Jasa Servis", isService: true }

beforeEach(() => {
  vi.clearAllMocks()
  ALL_MOVES.length = 0
  mocks.salesInvoiceFindMany.mockResolvedValue([])
  mocks.itemFindMany.mockResolvedValue([STOCK_ITEM, SERVICE_ITEM])
})

async function seedAndLoad(
  items: { itemId: number | null; qty: number; total: number }[],
  moves: MoveFixture[],
  dimension: "faktur" | "barang" | "pelanggan" = "faktur",
) {
  mocks.salesInvoiceFindMany.mockResolvedValue([invoice({ items })])
  ALL_MOVES.push(...moves)
  const { result } = await loadProfitability(PERIOD, dimension)
  return result
}

describe("loadProfitability — cakupan HPP berbasis qty (R-13)", () => {
  it("epsilon eksplisit dan di bawah presisi qty Decimal(15,2)", () => {
    expect(QTY_EPSILON).toBe(1e-9)
    expect(QTY_EPSILON).toBeLessThan(0.01)
  })

  it("query stok hanya OUT posted untuk faktur periode ini", async () => {
    mocks.salesInvoiceFindMany.mockResolvedValue([
      invoice({ items: [{ itemId: 5, qty: 10, total: 1_000_000 }] }),
    ])

    await loadProfitability(PERIOD, "faktur")

    expect(mocks.stockMoveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          referenceType: "SalesInvoice",
          referenceId: { in: [1] },
          impact: "OUT",
          status: "posted",
        },
        select: expect.objectContaining({ qty: true, cost: true }),
      }),
    )
    expect(mocks.salesInvoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          items: { select: expect.objectContaining({ itemId: true, qty: true, total: true }) },
        }),
      }),
    )
  })

  it("movement nihil: seluruh revenue stok masuk tanpa-HPP, jasa terpisah", async () => {
    mocks.salesInvoiceFindMany.mockResolvedValue([
      invoice({
        items: [
          { itemId: 5, qty: 10, total: 1_000_000 },
          { itemId: 6, qty: 1, total: 200_000 },
        ],
      }),
    ])

    const { result } = await loadProfitability(PERIOD, "faktur")

    expect(result.totals.revenue).toBe(1_200_000)
    expect(result.totals.cogs).toBe(0)
    expect(result.totals.revenueMissingCogs).toBe(1_000_000)
    expect(result.totals.missingCogsLines).toBe(1)
  })

  it("parsial: jual 10 keluar 3 → 70% revenue masuk missing, HPP dari 3 unit", async () => {
    const result = await seedAndLoad(
      [{ itemId: 5, qty: 10, total: 1_000_000 }],
      [move({ referenceId: 1, itemId: 5, qty: 3, cost: 100 })],
    )

    expect(result.totals.cogs).toBe(300)
    expect(result.totals.revenueMissingCogs).toBeCloseTo(700_000)
    expect(result.totals.missingCogsLines).toBe(1)
  })

  it("penuh: keluar = jual → tidak ada missing", async () => {
    const result = await seedAndLoad(
      [{ itemId: 5, qty: 10, total: 1_000_000 }],
      [move({ referenceId: 1, itemId: 5, qty: 4, cost: 100 }), move({ referenceId: 1, itemId: 5, qty: 6, cost: 100 })],
    )

    expect(result.totals.cogs).toBe(1_000)
    expect(result.totals.revenueMissingCogs).toBe(0)
    expect(result.totals.missingCogsLines).toBe(0)
  })

  it("kelebihan keluar tidak menghasilkan missing negatif", async () => {
    const result = await seedAndLoad(
      [{ itemId: 5, qty: 10, total: 1_000_000 }],
      [move({ referenceId: 1, itemId: 5, qty: 12, cost: 100 })],
    )

    expect(result.totals.cogs).toBe(1_200)
    expect(result.totals.revenueMissingCogs).toBe(0)
    expect(result.totals.missingCogsLines).toBe(0)
  })

  it("SKU berulang: qty diagregat, proporsi diatribusikan per baris, garis dihitung sekali, HPP tidak dobel", async () => {
    // Dua baris SKU sama: 4 unit/Rp400rb + 6 unit/Rp600rb = jual 10/Rp1jt.
    // Keluar 5 → uncovered 50% → missing Rp500rb (200rb + 300rb), satu garis.
    mocks.salesInvoiceFindMany.mockResolvedValue([
      invoice({
        items: [
          { itemId: 5, qty: 4, total: 400_000 },
          { itemId: 5, qty: 6, total: 600_000 },
        ],
      }),
    ])
    ALL_MOVES.push(move({ referenceId: 1, itemId: 5, qty: 5, cost: 100 }))

    for (const dimension of ["faktur", "barang", "pelanggan"] as const) {
      const { result } = await loadProfitability(PERIOD, dimension)

      expect(result.totals.revenue).toBe(1_000_000)
      expect(result.totals.cogs).toBe(500)
      expect(result.totals.revenueMissingCogs).toBeCloseTo(500_000)
      expect(result.totals.missingCogsLines).toBe(1)
    }
  })

  it("SKU berulang ter-cover gabungan baris: keluar menjumlah terhadap total qty faktur", async () => {
    // 4 + 6 keluar dalam dua move — masing-masing move < qty satu baris,
    // tapi gabungan = total qty faktur → penuh.
    const result = await seedAndLoad(
      [
        { itemId: 5, qty: 4, total: 400_000 },
        { itemId: 5, qty: 6, total: 600_000 },
      ],
      [move({ referenceId: 1, itemId: 5, qty: 4, cost: 100 }), move({ referenceId: 1, itemId: 5, qty: 6, cost: 100 })],
      "barang",
    )

    expect(result.totals.cogs).toBe(1_000)
    expect(result.totals.revenueMissingCogs).toBe(0)
    expect(result.totals.missingCogsLines).toBe(0)
  })

  it("reversal & IN tidak dihitung: hanya move OUT posted dari query", async () => {
    const result = await seedAndLoad(
      [{ itemId: 5, qty: 10, total: 1_000_000 }],
      [
        // Reversal: stok kembali — status bukan posted, tersaring query.
        move({ referenceId: 1, itemId: 5, qty: 10, cost: 100, status: "reversed" }),
        move({ referenceId: 1, itemId: 5, qty: 10, cost: 100, status: "draft" }),
        // Pembalikan arah: impact IN, tersaring query.
        move({ referenceId: 1, itemId: 5, qty: 10, cost: 100, impact: "IN" }),
      ],
    )

    expect(result.totals.cogs).toBe(0)
    expect(result.totals.revenueMissingCogs).toBe(1_000_000)
    expect(result.totals.missingCogsLines).toBe(1)
  })

  it("reversal parsial: OUT posted tetap dihitung, sisanya yang reversed tidak menutup kekurangan", async () => {
    const result = await seedAndLoad(
      [{ itemId: 5, qty: 10, total: 1_000_000 }],
      [
        move({ referenceId: 1, itemId: 5, qty: 3, cost: 100 }),
        move({ referenceId: 1, itemId: 5, qty: 7, cost: 100, status: "reversed" }),
        move({ referenceId: 1, itemId: 5, qty: 7, cost: 100, impact: "IN" }),
      ],
    )

    expect(result.totals.cogs).toBe(300)
    expect(result.totals.revenueMissingCogs).toBeCloseTo(700_000)
    expect(result.totals.missingCogsLines).toBe(1)
  })

  it("garis qty nol tidak menghasilkan missing (tidak ada dasar proporsi)", async () => {
    const result = await seedAndLoad([{ itemId: 5, qty: 0, total: 100_000 }], [])

    expect(result.totals.revenueMissingCogs).toBe(0)
    expect(result.totals.missingCogsLines).toBe(0)
  })

  it("tanpa faktur: query stok dilewati, hasil kosong", async () => {
    const { result } = await loadProfitability(PERIOD, "pelanggan")

    expect(mocks.stockMoveFindMany).not.toHaveBeenCalled()
    expect(result.totals.revenue).toBe(0)
    expect(result.totals.revenueMissingCogs).toBe(0)
  })
})

describe("loadProfitability — presisi sen loader HPP", () => {
  it("HPP per move dibulatkan sen sebelum diagregat: 3 move 1×0,335 → 1,02 bukan 1,01", async () => {
    const result = await seedAndLoad(
      [{ itemId: 5, qty: 3, total: 300 }],
      [
        move({ referenceId: 1, itemId: 5, qty: 1, cost: 0.335 }),
        move({ referenceId: 1, itemId: 5, qty: 1, cost: 0.335 }),
        move({ referenceId: 1, itemId: 5, qty: 1, cost: 0.335 }),
      ],
    )
    // Per move: safeMultiply(1, 0.335, 2)=0,34; total 1,02.
    // Mentah: 3×0.335=1,0050000000000001 dibulatkan builder sekali → 1,01 (salah sen).
    expect(result.totals.cogs).toBe(1.02)
    expect(result.totals.grossProfit).toBe(298.98)
  })
})
