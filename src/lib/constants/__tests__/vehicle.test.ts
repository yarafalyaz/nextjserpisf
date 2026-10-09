import { describe, it, expect } from "vitest"
import {
  DRIVETRAIN_OPTIONS,
  TRANSMISSION_OPTIONS,
  DRIVETRAIN_VALUES,
  TRANSMISSION_VALUES,
} from "@/lib/constants/vehicle"

/**
 * VEH-07 fitment matching compares drivetrain/transmission as case-insensitive
 * exact strings. These constants are the single vocabulary the variant manager,
 * fitment-rule form, and fitment checker all draw from — a drift between them
 * (e.g. a variant stored as "4x4" but a rule typed "4WD") silently makes every
 * rule miss. Pin the shape so that cannot regress unnoticed.
 */
describe("vehicle drivetrain/transmission enumeration", () => {
  it("exposes option objects with distinct, non-empty value+label", () => {
    for (const list of [DRIVETRAIN_OPTIONS, TRANSMISSION_OPTIONS]) {
      expect(list.length).toBeGreaterThan(0)
      const values = list.map((o) => o.value)
      expect(new Set(values).size).toBe(values.length)
      for (const o of list) {
        expect(o.value.trim()).not.toBe("")
        expect(o.label.trim()).not.toBe("")
      }
    }
  })

  it("derives the *_VALUES helpers from the option lists", () => {
    expect(DRIVETRAIN_VALUES).toEqual(DRIVETRAIN_OPTIONS.map((o) => o.value))
    expect(TRANSMISSION_VALUES).toEqual(TRANSMISSION_OPTIONS.map((o) => o.value))
  })

  it("includes the values the UI previously offered", () => {
    // Guards the variant manager's historical vocabulary.
    for (const v of ["4x2", "4x4", "AWD"]) expect(DRIVETRAIN_VALUES).toContain(v)
    for (const v of ["AT", "MT", "CVT"]) expect(TRANSMISSION_VALUES).toContain(v)
  })
})
