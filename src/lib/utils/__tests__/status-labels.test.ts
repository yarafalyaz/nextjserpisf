import { describe, it, expect } from "vitest"
import { statusLabel, statusToIndo, indoToStatus, STATUS_LABELS } from "../status-labels"

describe("statusLabel", () => {
  it("returns Indonesian label for known status", () => {
    expect(statusLabel("draft")).toBe("Konsep")
    expect(statusLabel("approved")).toBe("Disetujui")
    expect(statusLabel("paid")).toBe("Dibayar")
    expect(statusLabel("cancelled")).toBe("Dibatalkan")
  })

  it("returns original string for unknown status", () => {
    expect(statusLabel("some_unknown")).toBe("some_unknown")
  })

  it("returns - for null/undefined", () => {
    expect(statusLabel(null)).toBe("-")
    expect(statusLabel(undefined)).toBe("-")
  })
})

describe("statusToIndo", () => {
  it("maps DB status to URL-friendly Indonesian", () => {
    expect(statusToIndo["draft"]).toBe("konsep")
    expect(statusToIndo["in_progress"]).toBe("dalam-proses")
    expect(statusToIndo["cancelled"]).toBe("batal")
  })
})

describe("indoToStatus", () => {
  it("maps URL-friendly Indonesian back to DB status", () => {
    expect(indoToStatus["konsep"]).toBe("draft")
    expect(indoToStatus["dalam-proses"]).toBe("in_progress")
    expect(indoToStatus["batal"]).toBe("cancelled")
  })

  it("is inverse of statusToIndo", () => {
    for (const [db, url] of Object.entries(statusToIndo)) {
      expect(indoToStatus[url]).toBe(db)
    }
  })
})

describe("STATUS_LABELS completeness", () => {
  it("has labels for all common statuses", () => {
    const required = ["draft", "pending", "approved", "rejected", "completed", "cancelled", "paid"]
    for (const status of required) {
      expect(STATUS_LABELS[status]).toBeDefined()
    }
  })
})
