import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildInventoryReconciliation,
  inventoryReconciliationSummary,
} from "@/lib/reports/inventory-reconciliation"

const dataMocks = vi.hoisted(() => ({
  prismaMock: {
    inventoryLayer: { findMany: vi.fn() },
    warehouse: { findMany: vi.fn() },
    account: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: dataMocks.prismaMock }))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: async () => ({ inventoryAccountId: null, costingMethod: "fifo" }),
}))
vi.mock("@/lib/services/report-aggregation.service", () => ({
  sumNetForAccount: async () => 0,
}))

import { loadInventoryReconciliation } from "../inventory-reconciliation-data"

beforeEach(() => {
  vi.clearAllMocks()
  dataMocks.prismaMock.inventoryLayer.findMany.mockResolvedValue([])
  dataMocks.prismaMock.warehouse.findMany.mockResolvedValue([])
  dataMocks.prismaMock.account.findUnique.mockResolvedValue(null)
})

const valuation = {
  qty: 100,
  value: 5_000_000,
  byWarehouse: [{ code: "GD1", name: "Gudang Utama", items: 3, qty: 100, value: 5_000_000 }],
}

function noticesOf(result: ReturnType<typeof buildInventoryReconciliation>) {
  return result.table.rows.filter((row) => row.kind === "notice").map((row) => row.text)
}

describe("loadInventoryReconciliation cakupan gudang (putaran 69)", () => {
  const PERIOD = { start: new Date(2026, 0, 1), end: new Date(2026, 10, 2) }

  it("scope [2]: where layer menapis gudang cakupan; tanpa scope where lama utuh", async () => {
    await loadInventoryReconciliation(PERIOD, [2])
    const scopedArg = dataMocks.prismaMock.inventoryLayer.findMany.mock.calls[0][0]
    expect(scopedArg.where).toEqual(
      expect.objectContaining({ remaining: { gt: 0 }, warehouseId: { in: [2] } }),
    )

    await loadInventoryReconciliation(PERIOD)
    const globalArg = dataMocks.prismaMock.inventoryLayer.findMany.mock.calls[1][0]
    expect(globalArg.where).toEqual({ remaining: { gt: 0 } })
  })

  it("scope []: where paksa kosong (tak ada gudang bocor)", async () => {
    await loadInventoryReconciliation(PERIOD, [])
    const arg = dataMocks.prismaMock.inventoryLayer.findMany.mock.calls[0][0]
    expect(arg.where).toEqual(
      expect.objectContaining({ warehouseId: { in: [] } }),
    )
  })
})

describe("buildInventoryReconciliation", () => {
  it("menyatakan cocok bila saldo akun sama dengan nilai barang", () => {
    const result = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300 Persediaan", balance: 5_000_000 },
      periodEndIsToday: true,
    })

    expect(result.totals.difference).toBe(0)
    expect(result.totals.isBalanced).toBe(true)
    expect(result.verdict).toContain("sama dengan nilai barang")
    expect(noticesOf(result).some((text) => text.includes("tidak ada selisih"))).toBe(true)
  })

  it("menghitung selisih buku besar dikurangi nilai barang dan menyebut arahnya", () => {
    const result = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300 Persediaan", balance: 5_250_000 },
      periodEndIsToday: true,
    })

    expect(result.totals.difference).toBe(250_000)
    expect(result.totals.isBalanced).toBe(false)
    expect(result.verdict).toContain("250.000")
    expect(noticesOf(result).some((text) => text.includes("buku besar lebih besar"))).toBe(true)
  })

  it("menyebut nilai barang lebih besar bila saldo akun lebih kecil", () => {
    const result = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300 Persediaan", balance: 4_750_000 },
      periodEndIsToday: true,
    })

    expect(result.totals.difference).toBe(-250_000)
    expect(noticesOf(result).some((text) => text.includes("nilai barang lebih besar"))).toBe(true)
  })

  it("TIDAK menampilkan nol saat akun persediaan belum dipetakan", () => {
    const result = buildInventoryReconciliation({ valuation, ledger: null, periodEndIsToday: true })
    const nilaiCells = result.table.rows.map((row) => (row.kind === "data" ? row.cells[1] : ""))

    expect(result.totals.ledgerBalance).toBeNull()
    expect(result.totals.difference).toBeNull()
    expect(result.totals.isBalanced).toBe(false)
    expect(nilaiCells).toContain("–")
    expect(nilaiCells.filter((cell) => cell === "0")).toHaveLength(0)
    expect(noticesOf(result).some((text) => text.includes("belum dipetakan"))).toBe(true)
    expect(inventoryReconciliationSummary(result)).toContain("belum dipetakan")
  })

  it("memberi catatan titik waktu bila periode bukan periode berjalan", () => {
    const result = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300 Persediaan", balance: 5_000_000 },
      periodEndIsToday: false,
    })

    expect(noticesOf(result).some((text) => text.includes("perbedaan titik waktu"))).toBe(true)
  })

  it("menampilkan rincian per gudang dari nilai barang", () => {
    const result = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300 Persediaan", balance: 5_000_000 },
      periodEndIsToday: true,
    })
    const teks = result.table.rows.map((row) => (row.kind === "data" ? row.cells.join(" ") : "")).join(" | ")

    expect(teks).toContain("Gudang Utama (GD1)")
    expect(teks).toContain("3 barang")
  })

  it("meringkas untuk KPI: cocok, selisih, atau belum dipetakan", () => {
    const cocok = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300", balance: 5_000_000 },
      periodEndIsToday: true,
    })
    const selisih = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300", balance: 5_000_001 },
      periodEndIsToday: true,
    })

    expect(inventoryReconciliationSummary(cocok)).toContain("Cocok")
    expect(inventoryReconciliationSummary(selisih)).toContain("Selisih")
  })
})
