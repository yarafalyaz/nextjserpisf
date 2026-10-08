import { describe, it, expect, vi, beforeEach } from "vitest"

// Central costing-method resolver. Regression guard for the inconsistency where
// goods-receipt/inventory (receive) defaulted to "average" while the sale/consume
// path defaulted to "fifo", so an item with no explicit method received and sold
// at different HPP. All paths must now resolve identically.

const findFirst = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: { systemSetting: { findFirst: (...a: unknown[]) => findFirst(...a) } },
}))

import {
  resolveCostingMethod,
  getGlobalCostingMethod,
  resolveCostingMethodForItem,
} from "@/lib/services/costing-method.service"

beforeEach(() => {
  vi.clearAllMocks()
  findFirst.mockResolvedValue({ costingMethod: "FIFO" })
})

describe("resolveCostingMethod (pure precedence)", () => {
  it("category wins over item and global", () => {
    expect(
      resolveCostingMethod({ categoryMethod: "average", itemMethod: "fifo", globalMethod: "fifo" }),
    ).toBe("average")
  })

  it("item wins over global when category is unset", () => {
    expect(
      resolveCostingMethod({ categoryMethod: null, itemMethod: "average", globalMethod: "fifo" }),
    ).toBe("average")
  })

  it("global is used when category and item are unset", () => {
    expect(
      resolveCostingMethod({ itemMethod: null, globalMethod: "average" }),
    ).toBe("average")
  })

  it("falls back to fifo when everything is unset", () => {
    expect(resolveCostingMethod({})).toBe("fifo")
  })

  it("treats unknown/blank values as unset (no silent average)", () => {
    expect(resolveCostingMethod({ categoryMethod: "lifo", itemMethod: "", globalMethod: "  " })).toBe("fifo")
  })

  it("is case-insensitive", () => {
    expect(resolveCostingMethod({ itemMethod: "Average" })).toBe("average")
    expect(resolveCostingMethod({ itemMethod: "FIFO" })).toBe("fifo")
  })
})

describe("getGlobalCostingMethod", () => {
  it("reads the company setting", async () => {
    findFirst.mockResolvedValue({ costingMethod: "Average" })
    expect(await getGlobalCostingMethod()).toBe("average")
  })

  it("defaults to fifo when no settings row exists", async () => {
    findFirst.mockResolvedValue(null)
    expect(await getGlobalCostingMethod()).toBe("fifo")
  })

  it("defaults to fifo (does not throw) when the settings read fails", async () => {
    findFirst.mockRejectedValue(new Error("db down"))
    expect(await getGlobalCostingMethod()).toBe("fifo")
  })
})

describe("resolveCostingMethodForItem (receive vs sell must agree)", () => {
  it("resolves the SAME method given the same item on both paths", async () => {
    findFirst.mockResolvedValue({ costingMethod: "FIFO" })
    // Item with no explicit method and no category → both callers must get fifo.
    const item = { costingMethod: null, category: null }
    expect(await resolveCostingMethodForItem(item)).toBe("fifo")
    expect(await resolveCostingMethodForItem(item)).toBe("fifo")
  })

  it("honours a per-item average override", async () => {
    findFirst.mockResolvedValue({ costingMethod: "FIFO" })
    expect(
      await resolveCostingMethodForItem({ costingMethod: "average", category: null }),
    ).toBe("average")
  })

  it("honours the company default when item/category are unset", async () => {
    findFirst.mockResolvedValue({ costingMethod: "Average" })
    expect(
      await resolveCostingMethodForItem({ costingMethod: null, category: { costingMethod: null } }),
    ).toBe("average")
  })
})
