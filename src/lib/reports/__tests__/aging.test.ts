import { describe, it, expect } from "vitest"
import { AGING_BUCKETS, agingBucket, daysOverdue } from "../aging"

describe("daysOverdue", () => {
  it("counts whole days overdue, ignoring time-of-day", () => {
    const due = new Date(2026, 0, 10, 23, 59) // 10 Jan
    const asOf = new Date(2026, 0, 11, 0, 0) // 11 Jan
    expect(daysOverdue(due, asOf)).toBe(1)
  })

  it("is negative when not yet due", () => {
    const due = new Date(2026, 0, 20)
    const asOf = new Date(2026, 0, 10)
    expect(daysOverdue(due, asOf)).toBe(-10)
  })

  it("is 0 on the due date regardless of clock time", () => {
    expect(daysOverdue(new Date(2026, 0, 10, 0, 0), new Date(2026, 0, 10, 23, 59))).toBe(0)
  })
})

describe("agingBucket", () => {
  it("buckets not-yet-due (<=0) as 'Belum Jatuh Tempo'", () => {
    expect(agingBucket(0)).toBe("Belum Jatuh Tempo")
    expect(agingBucket(-5)).toBe("Belum Jatuh Tempo")
  })

  it("buckets overdue by ranges", () => {
    expect(agingBucket(1)).toBe("1–30 Hari")
    expect(agingBucket(30)).toBe("1–30 Hari")
    expect(agingBucket(31)).toBe("31–60 Hari")
    expect(agingBucket(60)).toBe("31–60 Hari")
    expect(agingBucket(61)).toBe("61–90 Hari")
    expect(agingBucket(90)).toBe("61–90 Hari")
    expect(agingBucket(91)).toBe("> 90 Hari")
    expect(agingBucket(365)).toBe("> 90 Hari")
  })

  it("an invoice 200 days overdue is NOT bucketed with one due today", () => {
    expect(agingBucket(200)).not.toBe(agingBucket(0))
    expect(agingBucket(200)).toBe("> 90 Hari")
  })

  it("exposes the ordered bucket list used by the report tables", () => {
    expect(AGING_BUCKETS).toEqual([
      "Belum Jatuh Tempo",
      "1–30 Hari",
      "31–60 Hari",
      "61–90 Hari",
      "> 90 Hari",
    ])
  })
})
