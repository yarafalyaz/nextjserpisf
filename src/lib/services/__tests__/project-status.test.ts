import { describe, it, expect } from "vitest"
import { computeProjectStatus } from "@/lib/services/project-status"

describe("computeProjectStatus", () => {
  const t1 = new Date("2026-01-15T10:00:00.000Z")
  const t2 = new Date("2026-02-20T14:30:00.000Z")

  it("stamps endDate on the first transition to completed", () => {
    const stages = [{ status: "completed" }, { status: "completed" }, { status: "skipped" }]
    const res = computeProjectStatus(stages, "in_progress", null, t1)
    expect(res.status).toBe("completed")
    expect(res.endDate).toEqual(t1)
    expect(res.changed).toBe(true)
  })

  it("does NOT drift endDate when re-run on an already-completed project", () => {
    // Regression: the old code wrote `endDate: new Date()` unconditionally on
    // every call. A later work order completing for the same project would
    // overwrite the historical completion date (t1) with the current time (t2).
    const stages = [{ status: "completed" }, { status: "completed" }]
    const res = computeProjectStatus(stages, "completed", t1, t2)
    expect(res.status).toBe("completed")
    expect(res.endDate).toEqual(t1) // preserved, not t2
    expect(res.changed).toBe(false)
  })

  it("clears endDate when transitioning from completed back to in_progress", () => {
    const stages = [{ status: "completed" }, { status: "in_progress" }]
    const res = computeProjectStatus(stages, "completed", t1, t2)
    expect(res.status).toBe("in_progress")
    expect(res.endDate).toBeNull()
    expect(res.changed).toBe(true)
  })

  it("marks in_progress when at least one stage is in progress", () => {
    const stages = [{ status: "pending" }, { status: "in_progress" }, { status: "pending" }]
    const res = computeProjectStatus(stages, "active", null, t1)
    expect(res.status).toBe("in_progress")
    expect(res.endDate).toBeNull()
    expect(res.changed).toBe(true)
  })

  it("marks in_progress when some stages are completed but not all", () => {
    const stages = [{ status: "completed" }, { status: "pending" }]
    const res = computeProjectStatus(stages, "active", null, t1)
    expect(res.status).toBe("in_progress")
    expect(res.changed).toBe(true)
  })

  it("returns no change for a project with zero stages", () => {
    const res = computeProjectStatus([], "active", null, t1)
    expect(res.status).toBe("active")
    expect(res.changed).toBe(false)
  })

  it("does not re-stamp in_progress endDate when already in_progress and unchanged", () => {
    const stages = [{ status: "completed" }, { status: "pending" }]
    const res = computeProjectStatus(stages, "in_progress", null, t2)
    expect(res.status).toBe("in_progress")
    expect(res.endDate).toBeNull()
    expect(res.changed).toBe(false)
  })
})
