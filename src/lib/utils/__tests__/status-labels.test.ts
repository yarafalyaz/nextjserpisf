import { describe, it, expect } from "vitest"
import {
  statusLabel,
  statusToIndo,
  indoToStatus,
  STATUS_LABELS,
  labelFrom,
  LEAVE_TYPE_LABELS,
  ASSET_HISTORY_TYPE_LABELS,
  LEAD_ACTIVITY_TYPE_LABELS,
  LEAD_ACTIVITY_TYPE_OPTIONS,
  SEVERITY_LABELS,
} from "../status-labels"
import { NONCONFORMANCE_SEVERITIES } from "@/lib/validations/qc.schemas"
import { leadActivitySchema } from "@/lib/validations/crm.schemas"

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

  // PUTUSAN Lead PR #1405 T1+T2: paid tak boleh hilang, written_off berlabel.
  it("keeps paid tone + written_off label (BR-LOAN)", () => {
    expect(STATUS_LABELS["paid"]).toBe("Dibayar")
    expect(statusLabel("written_off")).toBe("Dihapusbukukan")
    expect(statusLabel("paid_off")).toBe("Lunas")
    expect(indoToStatus["dihapusbukukan"]).toBe("written_off")
    expect(indoToStatus["lunas"]).toBe("paid_off")
  })
})

describe("labelFrom", () => {
  it("returns the Indonesian label for a known value", () => {
    expect(labelFrom(LEAVE_TYPE_LABELS, "annual")).toBe("Cuti Tahunan")
  })

  it("keeps an unknown value visible instead of rendering blank", () => {
    expect(labelFrom(LEAVE_TYPE_LABELS, "sabbatical")).toBe("sabbatical")
  })

  it("returns - for null/undefined", () => {
    expect(labelFrom(LEAVE_TYPE_LABELS, null)).toBe("-")
  })
})

describe("peta label enum", () => {
  it("menerjemahkan setiap tingkat keparahan NCR yang divalidasi skema", () => {
    const untranslated = NONCONFORMANCE_SEVERITIES.filter((value) => !SEVERITY_LABELS[value])
    expect(untranslated).toEqual([])
  })

  it("menerjemahkan setiap jenis aktivitas prospek yang bisa dipilih pengguna", () => {
    const untranslated = LEAD_ACTIVITY_TYPE_OPTIONS.filter(
      (value) => !LEAD_ACTIVITY_TYPE_LABELS[value],
    )
    expect(untranslated).toEqual([])
  })

  it("menjaga opsi form aktivitas prospek tetap sama dengan enum skema", () => {
    const allowed = leadActivitySchema.shape.type.options as readonly string[]
    for (const value of LEAD_ACTIVITY_TYPE_OPTIONS) {
      expect(allowed).toContain(value)
    }
  })

  it("menerjemahkan tipe cuti dan tipe riwayat aset yang ditulis aplikasi", () => {
    expect(LEAVE_TYPE_LABELS["annual"]).toBe("Cuti Tahunan")
    expect(ASSET_HISTORY_TYPE_LABELS["depreciation"]).toBe("Penyusutan")
    expect(ASSET_HISTORY_TYPE_LABELS["disposal"]).toBe("Pelepasan")
  })
})
