// @vitest-environment node
import { describe, it, expect, vi } from "vitest"

// The registry statically imports server actions (which transitively pull
// next-auth/next-server, unavailable in a pure unit environment). Only the
// shape of QUICK_ADD matters here, so stub the action modules.
vi.mock("@/actions/master.actions", () => ({ createAccount: vi.fn(), createBank: vi.fn(), createBrand: vi.fn(), createCustomer: vi.fn(), createCustomerCategory: vi.fn(), createDepartment: vi.fn(), createEmployee: vi.fn(), createItemCategory: vi.fn(), createPaymentTerm: vi.fn(), createPosition: vi.fn(), createTax: vi.fn(), createUom: vi.fn(), createVendor: vi.fn(), createWarehouse: vi.fn() }))
vi.mock("@/actions/method.actions", () => ({ createPaymentMethod: vi.fn(), createShippingMethod: vi.fn() }))
vi.mock("@/actions/finance.actions", () => ({ createCostCenter: vi.fn() }))

import { QUICK_ADD, type QuickAddDefinition } from "@/lib/quick-add/registry"
import type { QuickAddField } from "@/components/ui/quick-add-select"

/**
 * Guards the declarative quick-add registry. Every entry must be usable by
 * QuickAddSelect: a title, a callable action, and a `name` field (the dialog
 * uses `name` for the default label and the toast). A new entity added without
 * these would fail at click time, not build time — this test closes that gap.
 */
describe("QUICK_ADD registry", () => {
  // The registry uses `satisfies`, so each entry keeps its narrow literal field
  // shape. Widen to the declared interface so the optional `options` /
  // `defaultValue` properties are visible when iterating.
  const entries = Object.entries(QUICK_ADD) as [string, QuickAddDefinition][]

  it("is not empty", () => {
    expect(entries.length).toBeGreaterThan(10)
  })

  it.each(entries)("%s has a title, action and fields", (_key, def) => {
    expect(typeof def.title).toBe("string")
    expect(def.title.length).toBeGreaterThan(0)
    expect(typeof def.action).toBe("function")
    expect(Array.isArray(def.fields)).toBe(true)
    expect(def.fields.length).toBeGreaterThan(0)
  })

  it.each(entries)("%s exposes a `name` field as the first control", (_key, def) => {
    expect(def.fields[0]?.name).toBe("name")
    expect(def.fields[0]?.required).toBe(true)
  })

  it.each(entries)("%s select fields declare options", (_key, def) => {
    for (const field of def.fields as QuickAddField[]) {
      if (field.type === "select") {
        expect(Array.isArray(field.options)).toBe(true)
        expect((field.options ?? []).length).toBeGreaterThan(0)
        // A select must carry a default so a native uncontrolled form submits a
        // value even when the user never touches it.
        expect(field.defaultValue).toBeDefined()
      }
    }
  })
})
