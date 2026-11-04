import { describe, it, expect } from "vitest"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
describe("lock", () => {
  it("july end vs lock 30 jun", async () => {
    const end = new Date(Date.UTC(2026, 6 - 1, 0, 23, 59, 59, 999)) // fiscalYear 2025, month 7 -> 2026-06-30T23:59:59.999Z
    await expect(assertPeriodOpen(end)).rejects.toThrow()
  })
})
