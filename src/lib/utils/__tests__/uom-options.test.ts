import { describe, it, expect } from "vitest"
import {
  buildUomOptions,
  DEFAULT_UOM_OPTIONS,
} from "@/lib/utils/uom-options"

// Regression suite for the item form's "Satuan" dropdown now that it reads the
// UoM master (`/master/satuan`) instead of a hard-coded list. Guards:
//  - master rows become options keyed by UPPERCASE symbol (matches the app's
//    existing Item.unitOfMeasure / UomConversion.code values);
//  - an item's saved unit survives even when the master no longer lists it;
//  - an empty master still yields the historical default list, so the form
//    never ends up with zero choices.

describe("buildUomOptions", () => {
  it("maps master rows to options keyed by symbol, labelled with the name", () => {
    const options = buildUomOptions([
      { name: "Kilogram", symbol: "KG" },
      { name: "Pieces", symbol: "PCS" },
    ])
    expect(options).toEqual([
      { value: "KG", label: "KG — Kilogram" },
      { value: "PCS", label: "PCS — Pieces" },
    ])
  })

  it("omits the name suffix when it equals the symbol", () => {
    const options = buildUomOptions([{ name: "PCS", symbol: "PCS" }])
    expect(options).toEqual([{ value: "PCS", label: "PCS" }])
  })

  it("normalizes symbols to UPPERCASE so a 'Pcs' master row matches existing data", () => {
    const options = buildUomOptions([{ name: "Pcs", symbol: "Pcs" }])
    expect(options).toEqual([{ value: "PCS", label: "PCS" }])
  })

  it("dedupes case-insensitively", () => {
    const options = buildUomOptions([
      { name: "Pieces", symbol: "PCS" },
      { name: "Pcs", symbol: "pcs" },
    ])
    expect(options).toEqual([{ value: "PCS", label: "PCS — Pieces" }])
  })

  it("keeps the item's saved unit even when the master dropped it", () => {
    const options = buildUomOptions(
      [{ name: "Kilogram", symbol: "KG" }],
      "BOX",
    )
    expect(options[0]).toEqual({ value: "BOX", label: "BOX" })
    expect(options).toContainEqual({ value: "KG", label: "KG — Kilogram" })
  })

  it("does not duplicate the saved unit when the master still lists it", () => {
    // "Box" upper-cased equals the "BOX" symbol, so the master row yields a
    // single un-suffixed option (same rule as the "omits the name suffix" case
    // above); the saved value must not be prepended a second time.
    const options = buildUomOptions([{ name: "Box", symbol: "BOX" }], "BOX")
    expect(options).toEqual([{ value: "BOX", label: "BOX" }])
  })

  it("falls back to the historical default list when the master is empty", () => {
    const options = buildUomOptions([])
    expect(options.map((o) => o.value)).toEqual([...DEFAULT_UOM_OPTIONS])
  })

  it("falls back to the default list when the master is missing", () => {
    expect(buildUomOptions(null).map((o) => o.value)).toEqual([
      ...DEFAULT_UOM_OPTIONS,
    ])
    expect(buildUomOptions(undefined).map((o) => o.value)).toEqual([
      ...DEFAULT_UOM_OPTIONS,
    ])
  })

  it("ignores rows with a blank symbol", () => {
    const options = buildUomOptions([
      { name: "Broken", symbol: "   " },
      { name: "Kilogram", symbol: "KG" },
    ])
    expect(options).toEqual([{ value: "KG", label: "KG — Kilogram" }])
  })

  it("still returns the saved unit when the master is empty (no data loss)", () => {
    // RIM is not in the default list, so it must be preserved at the top.
    const options = buildUomOptions([], "RIM")
    expect(options[0]).toEqual({ value: "RIM", label: "RIM" })
    // The defaults are still offered after the preserved value.
    expect(options).toContainEqual({ value: "PCS", label: "PCS" })
  })

  it("does not prepend a saved unit that the default list already covers", () => {
    const options = buildUomOptions([], "BOX")
    expect(options.map((o) => o.value)).toEqual([...DEFAULT_UOM_OPTIONS])
  })
})
