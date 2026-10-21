import { describe, expect, it } from "vitest"
import {
  buildWorkOrderProgress,
  evaluateWorkOrderOperationTransition,
  parseWorkOrderStageNames,
  WORK_ORDER_PROGRESS_NOTICE,
  type WorkOrderOperationInput,
} from "../work-order-progress"

function op(over: Partial<WorkOrderOperationInput> = {}): WorkOrderOperationInput {
  return {
    id: 1,
    name: "Persiapan",
    sortOrder: 1,
    status: "pending",
    assignedEmployeeId: null,
    estimatedHours: null,
    notes: null,
    ...over,
  }
}

const OPS = [
  { name: "Persiapan", sortOrder: 1, status: "completed" },
  { name: "Pengerjaan", sortOrder: 2, status: "pending" },
  { name: "Selesai", sortOrder: 3, status: "pending" },
]

describe("parseWorkOrderStageNames", () => {
  it("parse setting koma pola defaultProjectStages", () => {
    expect(parseWorkOrderStageNames("A, B ,C")).toEqual(["A", "B", "C"])
  })
  it("setting kosong/null jatuh ke 4 nama default vonis Lead", () => {
    expect(parseWorkOrderStageNames("")).toEqual([
      "Persiapan",
      "Pengerjaan",
      "Quality Check",
      "Selesai",
    ])
    expect(parseWorkOrderStageNames(null)).toHaveLength(4)
  })
})

describe("evaluateWorkOrderOperationTransition (vonis Q1-Q3)", () => {
  it("maju sesudah tahap sebelumnya selesai diperbolehkan", () => {
    expect(
      evaluateWorkOrderOperationTransition({
        workOrderStatus: "in_progress",
        operations: OPS,
        targetSortOrder: 2,
        targetStatus: "in_progress",
      }),
    ).toEqual({ ok: true })
  })

  it("SEQUENSIAL-KERAS: lompat sebelum tahap sebelumnya selesai ditolak", () => {
    const v = evaluateWorkOrderOperationTransition({
      workOrderStatus: "in_progress",
      operations: OPS,
      targetSortOrder: 3,
      targetStatus: "in_progress",
    })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toContain("Pengerjaan")
  })

  it("sebelumnya skipped tetap membebaskan urutan", () => {
    expect(
      evaluateWorkOrderOperationTransition({
        workOrderStatus: "in_progress",
        operations: [
          { name: "Persiapan", sortOrder: 1, status: "skipped" },
          { name: "Pengerjaan", sortOrder: 2, status: "pending" },
        ],
        targetSortOrder: 2,
        targetStatus: "completed",
      }),
    ).toEqual({ ok: true })
  })

  it("skipped wajib notes alasan; dengan alasan diperbolehkan", () => {
    const tanpa = evaluateWorkOrderOperationTransition({
      workOrderStatus: "in_progress",
      operations: OPS,
      targetSortOrder: 1,
      targetStatus: "skipped",
    })
    expect(tanpa.ok).toBe(false)
    expect(
      evaluateWorkOrderOperationTransition({
        workOrderStatus: "in_progress",
        operations: OPS,
        targetSortOrder: 1,
        targetStatus: "skipped",
        notes: "unit tidak butuh persiapan",
      }),
    ).toEqual({ ok: true })
  })

  it("mutasi di luar WO in_progress ditolak (draft/completed)", () => {
    for (const s of ["draft", "completed", "closed"]) {
      const v = evaluateWorkOrderOperationTransition({
        workOrderStatus: s,
        operations: OPS,
        targetSortOrder: 1,
        targetStatus: "completed",
      })
      expect(v.ok).toBe(false)
    }
  })

  it("status target tidak sah ditolak", () => {
    const v = evaluateWorkOrderOperationTransition({
      workOrderStatus: "in_progress",
      operations: OPS,
      targetSortOrder: 1,
      targetStatus: "done",
    })
    expect(v.ok).toBe(false)
  })
})

describe("buildWorkOrderProgress", () => {
  it("tanpa tahap sama sekali: hasStages false, percent null (bukan 0 karangan)", () => {
    const r = buildWorkOrderProgress({ operations: [] })
    expect(r.hasStages).toBe(false)
    expect(r.percent).toBeNull()
    expect(r.notice).toBe(WORK_ORDER_PROGRESS_NOTICE)
  })

  it("semua skipped: denominator 0, percent null", () => {
    const r = buildWorkOrderProgress({
      operations: [op({ status: "skipped", notes: "tidak perlu" })],
    })
    expect(r.denominator).toBe(0)
    expect(r.percent).toBeNull()
  })

  it("skipped keluar denominator: 1 completed + 1 skipped + 1 pending = 50%", () => {
    const r = buildWorkOrderProgress({
      operations: [
        op({ id: 1, sortOrder: 1, status: "completed" }),
        op({ id: 2, name: "Pengerjaan", sortOrder: 2, status: "skipped", notes: "x" }),
        op({ id: 3, name: "Selesai", sortOrder: 3, status: "pending" }),
      ],
    })
    expect(r.percent).toBe(50)
    expect(r.completedCount).toBe(1)
    expect(r.skippedCount).toBe(1)
    expect(r.pendingCount).toBe(1)
  })

  it("baris terblokir urutan membawa nama penghambat; tuntas membebaskan", () => {
    const r = buildWorkOrderProgress({
      operations: [
        op({ id: 1, sortOrder: 1, status: "in_progress" }),
        op({ id: 2, name: "Pengerjaan", sortOrder: 2, status: "pending" }),
      ],
    })
    expect(r.rows[1].isActionable).toBe(false)
    expect(r.rows[1].blockedByName).toBe("Persiapan")
    expect(r.rows[0].isActionable).toBe(true)
  })
})
