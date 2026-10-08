import { describe, it, expect } from "vitest"
import {
  resolveDepreciationAccounts,
  hasCompleteDepreciationAccounts,
} from "@/lib/finance/depreciation-accounts"

describe("resolveDepreciationAccounts", () => {
  it("prefers the per-category mapping over settings and env", () => {
    const r = resolveDepreciationAccounts({
      categoryExpenseAccountId: 11,
      categoryAccumDepAccountId: 12,
      settingsExpenseAccountId: 21,
      settingsAccumDepAccountId: 22,
      envExpenseAccountId: "31",
      envAccumDepAccountId: "32",
    })
    expect(r).toEqual({ expenseAccountId: 11, accumulatedAccountId: 12 })
  })

  it("falls back to settings when the category has no mapping", () => {
    const r = resolveDepreciationAccounts({
      categoryExpenseAccountId: null,
      categoryAccumDepAccountId: null,
      settingsExpenseAccountId: 21,
      settingsAccumDepAccountId: 22,
      envExpenseAccountId: "31",
      envAccumDepAccountId: "32",
    })
    expect(r).toEqual({ expenseAccountId: 21, accumulatedAccountId: 22 })
  })

  it("resolves each slot independently (category expense + settings accumulated)", () => {
    const r = resolveDepreciationAccounts({
      categoryExpenseAccountId: 11,
      categoryAccumDepAccountId: null,
      settingsExpenseAccountId: 21,
      settingsAccumDepAccountId: 22,
    })
    expect(r).toEqual({ expenseAccountId: 11, accumulatedAccountId: 22 })
  })

  it("falls back to env vars last", () => {
    const r = resolveDepreciationAccounts({
      envExpenseAccountId: "31",
      envAccumDepAccountId: "32",
    })
    expect(r).toEqual({ expenseAccountId: 31, accumulatedAccountId: 32 })
  })

  it("returns 0 for unset slots rather than NaN", () => {
    const r = resolveDepreciationAccounts({})
    expect(r).toEqual({ expenseAccountId: 0, accumulatedAccountId: 0 })
  })

  it("treats zero / empty / non-numeric as unset and falls through", () => {
    const r = resolveDepreciationAccounts({
      categoryExpenseAccountId: 0,
      settingsExpenseAccountId: 0,
      envExpenseAccountId: "",
      envAccumDepAccountId: "not-a-number",
    })
    expect(r).toEqual({ expenseAccountId: 0, accumulatedAccountId: 0 })
  })

  it("skips a zero category value in favour of a later candidate", () => {
    const r = resolveDepreciationAccounts({
      categoryExpenseAccountId: 0,
      settingsExpenseAccountId: 21,
      categoryAccumDepAccountId: 0,
      envAccumDepAccountId: "32",
    })
    expect(r).toEqual({ expenseAccountId: 21, accumulatedAccountId: 32 })
  })
})

describe("hasCompleteDepreciationAccounts", () => {
  it("is true only when both accounts are positive", () => {
    expect(hasCompleteDepreciationAccounts({ expenseAccountId: 1, accumulatedAccountId: 2 })).toBe(true)
    expect(hasCompleteDepreciationAccounts({ expenseAccountId: 1, accumulatedAccountId: 0 })).toBe(false)
    expect(hasCompleteDepreciationAccounts({ expenseAccountId: 0, accumulatedAccountId: 0 })).toBe(false)
  })
})
