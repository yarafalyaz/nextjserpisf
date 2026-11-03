import { describe, it, expect } from "vitest"
import {
  buildBalanceComparison,
  buildComparison,
  groupBalancesByType,
  previousWindow,
  toAccountBalances,
  type AccountBalance,
} from "../period-comparison"

const accounts = [
  { id: 1, code: "4000", name: "Pendapatan", type: "REVENUE" },
  { id: 2, code: "5000", name: "HPP", type: "EXPENSE" },
  { id: 3, code: "1000", name: "Kas", type: "ASSET" },
]

describe("toAccountBalances", () => {
  it("uses the normal side per account type", () => {
    const sums = new Map([
      [1, { debit: 0, credit: 1000 }], // revenue → credit-normal → +1000
      [2, { debit: 400, credit: 0 }], // expense → debit-normal → +400
      [3, { debit: 700, credit: 200 }], // asset → debit-normal → +500
    ])
    const balances = toAccountBalances(accounts, sums)
    expect(balances.map((b) => b.balance)).toEqual([1000, 400, 500])
  })

  it("treats a missing sum as zero", () => {
    expect(toAccountBalances(accounts, new Map())[0].balance).toBe(0)
  })
})

describe("buildComparison", () => {
  const current = [
    { id: 1, code: "4000", name: "Pendapatan", type: "REVENUE", balance: 1500 },
    { id: 2, code: "5000", name: "HPP", type: "EXPENSE", balance: 600 },
    { id: 3, code: "1000", name: "Kas", type: "ASSET", balance: 0 },
  ]
  const previous = [
    { id: 1, code: "4000", name: "Pendapatan", type: "REVENUE", balance: 1000 },
    { id: 2, code: "5000", name: "HPP", type: "EXPENSE", balance: 600 },
    { id: 3, code: "1000", name: "Kas", type: "ASSET", balance: 0 },
  ]

  it("computes variance and percentage against the previous period", () => {
    const { rows } = buildComparison(current, previous)
    const revenue = rows.find((r) => r.code === "4000")
    expect(revenue).toMatchObject({ current: 1500, previous: 1000, variance: 500, percentage: 50 })
  })

  it("yields null percentage when the previous value is zero", () => {
    const { rows } = buildComparison(
      [{ id: 9, code: "6000", name: "Baru", type: "EXPENSE", balance: 300 }],
      [],
    )
    expect(rows[0]).toMatchObject({ current: 300, previous: 0, variance: 300, percentage: null })
  })

  it("drops accounts that are zero in both periods", () => {
    const { rows } = buildComparison(current, previous)
    expect(rows.map((r) => r.code)).toEqual(["4000", "5000"])
  })

  it("totals both periods and the variance", () => {
    const result = buildComparison(current, previous)
    expect(result.totalCurrent).toBe(2100)
    expect(result.totalPrevious).toBe(1600)
    expect(result.totalVariance).toBe(500)
  })
})

describe("previousWindow", () => {
  it("returns the same-length window immediately before the period", () => {
    const start = new Date(2026, 9, 1)
    const end = new Date(2026, 9, 31, 23, 59, 59)
    const previous = previousWindow(start, end)

    // Ends exactly before the current period starts, and is equally long.
    expect(previous.end.getTime()).toBe(start.getTime() - 1)
    expect(previous.end.getTime() - previous.start.getTime()).toBe(end.getTime() - start.getTime())
  })
})

const bal = (id: number, type: string, balance: number): AccountBalance => ({
  id,
  code: String(id),
  name: `Akun ${id}`,
  type,
  balance,
})

describe("groupBalancesByType", () => {
  it("mengelompokkan saldo per tipe akun", () => {
    const grouped = groupBalancesByType([
      bal(1, "ASSET", 10),
      bal(2, "LIABILITY", 20),
      bal(3, "EQUITY", 30),
      bal(4, "REVENUE", 40),
      bal(5, "EXPENSE", 50),
    ])
    expect(grouped.assets.map((r) => r.id)).toEqual([1])
    expect(grouped.liabilities.map((r) => r.id)).toEqual([2])
    expect(grouped.equity.map((r) => r.id)).toEqual([3])
    expect(grouped.revenue.map((r) => r.id)).toEqual([4])
    expect(grouped.expense.map((r) => r.id)).toEqual([5])
  })
})

/**
 * Putaran 103: mode neraca sebelumnya memuat ASSET/LIABILITY/EQUITY saja lalu
 * menjumlahkan ketiganya jadi satu TOTAL. Laba berjalan hilang sehingga neraca
 * tak pernah seimbang, dan TOTAL-nya (aset + kewajiban + ekuitas) tidak punya
 * arti. Di sini identitas neraca wajib tertutup per sisi.
 */
describe("buildBalanceComparison", () => {
  const current = groupBalancesByType([
    bal(1, "ASSET", 1000),
    bal(2, "LIABILITY", 300),
    bal(3, "EQUITY", 400),
    bal(4, "REVENUE", 500),
    bal(5, "EXPENSE", 200),
  ])
  const previous = groupBalancesByType([
    bal(1, "ASSET", 800),
    bal(2, "LIABILITY", 300),
    bal(3, "EQUITY", 400),
    bal(4, "REVENUE", 200),
    bal(5, "EXPENSE", 100),
  ])

  it("menyuntikkan laba berjalan ke ekuitas sehingga Aset = Kewajiban + Ekuitas", () => {
    const result = buildBalanceComparison(current, previous)
    expect(result.netIncomeCurrent).toBe(300)
    expect(result.netIncomePrevious).toBe(100)
    const ni = result.equity.rows.find((row) => row.code === "NI")
    expect(ni).toMatchObject({ name: "Laba/Rugi Berjalan", current: 300, previous: 100 })
    expect(result.equity.totalCurrent).toBe(700)
    expect(result.assets.totalCurrent).toBe(1000)
    expect(result.liabilities.totalCurrent).toBe(300)
    expect(result.isBalanced).toBe(true)
  })

  it("total per sisi, bukan penjumlahan aset + kewajiban + ekuitas", () => {
    const result = buildBalanceComparison(current, previous)
    // Angka lama (satu TOTAL/KPI) = 1000 + 300 + 400 (+ lupa laba 300) = 1700.
    expect(result.assets.totalCurrent).toBe(1000)
    expect(result.liabilities.totalCurrent).toBe(300)
    expect(result.equity.totalCurrent).toBe(700)
    expect(result.assets.totalCurrent).not.toBe(1700)
    expect(result.assets.totalPrevious).toBe(800)
    expect(result.liabilities.totalPrevious).toBe(300)
    expect(result.equity.totalPrevious).toBe(500)
  })

  it("neraca yang tidak seimbang ditandai, bukan disamarkan sebagai total", () => {
    const broken = groupBalancesByType([
      bal(1, "ASSET", 1000),
      bal(2, "LIABILITY", 300),
      bal(3, "EQUITY", 400),
      bal(4, "REVENUE", 500),
      bal(5, "EXPENSE", 100),
    ])
    expect(buildBalanceComparison(broken, broken).isBalanced).toBe(false)
  })

  it("laba berjalan nol tidak memunculkan baris sintetis", () => {
    const flat = groupBalancesByType([bal(1, "ASSET", 100), bal(3, "EQUITY", 100)])
    const result = buildBalanceComparison(flat, flat)
    expect(result.equity.rows.some((row) => row.code === "NI")).toBe(false)
    expect(result.isBalanced).toBe(true)
  })
})
