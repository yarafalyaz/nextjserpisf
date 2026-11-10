import { describe, it, expect } from "vitest"
import { collectDescendantAccountIds } from "../account-hierarchy"

describe("collectDescendantAccountIds", () => {
  const sampleAccounts = [
    { id: 1, parentId: null }, // Root 1 (e.g. Kas & Bank)
    { id: 2, parentId: 1 },    // Child 1 (Kas Operasional)
    { id: 3, parentId: 1 },    // Child 2 (Bank BCA)
    { id: 4, parentId: 3 },    // Grandchild (Bank BCA Giro)
    { id: 10, parentId: null }, // Unrelated Root 2 (Piutang)
    { id: 11, parentId: 10 },
  ]

  it("returns only root id when account has no children", () => {
    expect(collectDescendantAccountIds(sampleAccounts, 2)).toEqual([2])
    expect(collectDescendantAccountIds(sampleAccounts, 4)).toEqual([4])
  })

  it("recursively collects all children and grandchildren", () => {
    const result = collectDescendantAccountIds(sampleAccounts, 1)
    expect(result.sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  })

  it("handles branch with sub-branches correctly", () => {
    const result = collectDescendantAccountIds(sampleAccounts, 3)
    expect(result.sort((a, b) => a - b)).toEqual([3, 4])
  })
})
