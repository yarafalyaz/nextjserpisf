import { describe, it, expect } from "vitest"
import { SOFT_DELETE_MODELS, withSoftDeleteFilter } from "../soft-delete"

/**
 * The Prisma client (./prisma.ts) wraps `findMany`/`count` with this helper so a
 * forgotten `where: { deletedAt: null }` can no longer leak deleted rows into
 * lists and pickers (bug class B4/B5/B29).
 */

describe("SOFT_DELETE_MODELS", () => {
  it("is derived from the schema (DMMF)", () => {
    expect(SOFT_DELETE_MODELS.size).toBeGreaterThan(15)
    expect([...SOFT_DELETE_MODELS].sort()).toContain("Customer")
    expect(SOFT_DELETE_MODELS).toContain("Item")
    expect(SOFT_DELETE_MODELS).toContain("Tax")
  })

  it("does not include models without a deletedAt column", () => {
    for (const model of ["ActivityLog", "CostCenter", "User", "ItemCategory", "SystemSetting"]) {
      expect(SOFT_DELETE_MODELS.has(model)).toBe(false)
    }
  })
})

describe("withSoftDeleteFilter", () => {
  it("adds deletedAt: null for a soft-deletable model", () => {
    const args = { where: { isActive: true }, orderBy: { name: "asc" }, take: 20 }

    const filtered = withSoftDeleteFilter("Customer", args)

    expect(filtered).toEqual({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      take: 20,
    })
    // The original object is not mutated.
    expect(args.where).toEqual({ isActive: true })
  })

  it("creates a where clause when the caller passed none", () => {
    expect(withSoftDeleteFilter("Tax", undefined)).toEqual({ where: { deletedAt: null } })
    expect(withSoftDeleteFilter("Item", {})).toEqual({ where: { deletedAt: null } })
  })

  it("keeps a top-level OR intact (Prisma ANDs the extra key)", () => {
    const filtered = withSoftDeleteFilter("CrmTicket", {
      where: { OR: [{ subject: { contains: "x" } }] },
    })

    expect(filtered.where).toEqual({
      OR: [{ subject: { contains: "x" } }],
      deletedAt: null,
    })
  })

  it("respects an explicit deletedAt constraint", () => {
    const listingDeleted = { where: { deletedAt: { not: null } } }
    expect(withSoftDeleteFilter("Customer", listingDeleted)).toBe(listingDeleted)

    const alreadyFiltered = { where: { deletedAt: null, isActive: true } }
    expect(withSoftDeleteFilter("Customer", alreadyFiltered)).toBe(alreadyFiltered)
  })

  it("leaves models without soft delete untouched", () => {
    const args = { where: { code: "X" } }
    expect(withSoftDeleteFilter("CostCenter", args)).toBe(args)
    expect(withSoftDeleteFilter("ActivityLog", args)).toBe(args)
  })
})
