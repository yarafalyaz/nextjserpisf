import { describe, it, expect } from "vitest"
import { RECOGNISED_AR_STATUSES, RECOGNISED_AP_STATUSES } from "../document-status"

describe("recognised AR/AP document statuses", () => {
  it("counts issued (posted/partial/paid) documents only", () => {
    expect([...RECOGNISED_AR_STATUSES].sort()).toEqual(["paid", "partial", "posted"])
    expect([...RECOGNISED_AP_STATUSES].sort()).toEqual(["paid", "partial", "posted"])
  })

  it("never admits draft, sent, approved or cancelled documents", () => {
    for (const bad of ["draft", "sent", "approved", "cancelled"]) {
      expect(RECOGNISED_AR_STATUSES as readonly string[]).not.toContain(bad)
      expect(RECOGNISED_AP_STATUSES as readonly string[]).not.toContain(bad)
    }
  })
})
