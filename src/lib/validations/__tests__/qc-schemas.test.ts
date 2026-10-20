import { describe, it, expect } from "vitest"
import {
  QC_CHECKLIST_TYPES,
  createQcChecklistSchema,
  createQcInspectionSchema,
} from "@/lib/validations/qc.schemas"
import { QC_INSPECTION_TYPES } from "@/lib/services/qc.service"

// Safety checklists (K3) are a first-class checklist/inspection type (PRD FAB-10:
// inspeksi mencakup keselamatan), alongside incoming/in-process/final. This guards
// against the type being dropped from the enum while the DB column stays varchar.

// F-2026-10-20-13a: vehicle intake/handover are first-class checklist types in
// the same free-String column, so workshop staff can record existing damage at
// reception and vehicle condition at handover without a schema migration.

describe("QC checklist/inspection types include vehicle condition types", () => {
  it.each(["vehicle_intake", "vehicle_handover"])("lists '%s' among the accepted types", (type) => {
    expect(QC_CHECKLIST_TYPES).toContain(type)
    expect(QC_INSPECTION_TYPES).toContain(type)
  })

  it("accepts a vehicle intake inspection on a work order", () => {
    const parsed = createQcInspectionSchema.safeParse({
      checklistId: "5",
      inspectionType: "vehicle_intake",
      referenceType: "WorkOrder",
      referenceId: "9",
    })
    expect(parsed.success).toBe(true)
  })
})

describe("QC checklist/inspection types include 'safety'", () => {
  it("lists 'safety' among the accepted checklist types", () => {
    expect(QC_CHECKLIST_TYPES).toContain("safety")
    expect(QC_INSPECTION_TYPES).toContain("safety")
  })

  it("accepts a safety checklist via createQcChecklistSchema", () => {
    const parsed = createQcChecklistSchema.safeParse({
      name: "Checklist K3 Pengelasan",
      checklistType: "safety",
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.checklistType).toBe("safety")
  })

  it("accepts a safety inspection via createQcInspectionSchema", () => {
    const parsed = createQcInspectionSchema.safeParse({
      checklistId: "5",
      inspectionType: "safety",
      referenceType: "WorkOrder",
      referenceId: "9",
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.inspectionType).toBe("safety")
  })

  it("still rejects an unknown checklist type", () => {
    const parsed = createQcChecklistSchema.safeParse({
      name: "x",
      checklistType: "k3-random",
    })
    expect(parsed.success).toBe(false)
  })
})
