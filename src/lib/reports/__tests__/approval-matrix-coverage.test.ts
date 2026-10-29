import { describe, expect, it } from "vitest"
import {
  APPROVAL_MATRIX_EMPTY_STEP_OBSERVASI,
  APPROVAL_MATRIX_M2_OBSERVASI,
  APPROVAL_MATRIX_M3_OBSERVASI,
  APPROVAL_MATRIX_NO_STEP_OBSERVASI,
  APPROVAL_MATRIX_SOD_OBSERVASI,
  evaluateApprovalMatrixCoverage,
  type ApprovalMatrixCoverageConfig,
} from "../approval-matrix-coverage"

function config(over: Partial<ApprovalMatrixCoverageConfig> = {}): ApprovalMatrixCoverageConfig {
  return { workflows: [], approvals: [], ...over }
}

describe("evaluateApprovalMatrixCoverage", () => {
  it("E146-1: WAJIB tanpa workflow aktif = observasi M2/M3, bukan MERAH (BR-AMX-01 belum diterima)", () => {
    const q = evaluateApprovalMatrixCoverage(config(), ["Journal", "VendorPayment"])
    expect(q.totalWajib).toBe(2)
    expect(q.tanpaWorkflow).toBe(2)
    expect(q.terisi).toBe(0)
    for (const row of q.rows) {
      expect(row.hasActiveWorkflow).toBe(false)
      expect(row.stepsFilled).toBe(false)
      expect(row.observasi).toContain(APPROVAL_MATRIX_M2_OBSERVASI)
      expect(row.observasi).toContain(APPROVAL_MATRIX_M3_OBSERVASI)
    }
  })

  it("E146-1: workflow aktif tanpa langkah = observasi tanpa-langkah, bukan terisi", () => {
    const q = evaluateApprovalMatrixCoverage(
      config({ workflows: [{ modelType: "Journal", isActive: true, deletedAt: null, steps: [] }] }),
      ["Journal"],
    )
    expect(q.rows[0]).toMatchObject({ hasActiveWorkflow: true, stepsFilled: false })
    expect(q.rows[0].observasi).toContain(APPROVAL_MATRIX_NO_STEP_OBSERVASI)
    expect(q.langkahKosong).toBe(1)
  })

  it("E146-1: workflow nonaktif/terhapus = tidak dihitung aktif", () => {
    const q = evaluateApprovalMatrixCoverage(
      config({
        workflows: [
          { modelType: "Journal", isActive: false, deletedAt: null, steps: [{ roleId: 1, userId: null }] },
          { modelType: "Journal", isActive: true, deletedAt: new Date(), steps: [{ roleId: 1, userId: null }] },
        ],
      }),
      ["Journal"],
    )
    expect(q.rows[0].hasActiveWorkflow).toBe(false)
    expect(q.tanpaWorkflow).toBe(1)
  })

  it("E146-1: seed APR-JRN/APR-VPAY pola terisi = hasActiveWorkflow + stepsFilled", () => {
    const q = evaluateApprovalMatrixCoverage(
      config({
        workflows: [
          { modelType: "Journal", isActive: true, deletedAt: null, steps: [{ roleId: 9, userId: null }] },
          { modelType: "VendorPayment", isActive: true, deletedAt: null, steps: [{ roleId: 9, userId: null }] },
        ],
      }),
      ["Journal", "VendorPayment"],
    )
    expect(q.rows.map((r) => [r.modelType, r.hasActiveWorkflow, r.stepsFilled])).toEqual([
      ["Journal", true, true],
      ["VendorPayment", true, true],
    ])
    expect(q.terisi).toBe(2)
  })

  it("E146-2: langkah tanpa roleId DAN userId = stepsFilled false + observasi admin-saja", () => {
    const q = evaluateApprovalMatrixCoverage(
      config({
        workflows: [
          {
            modelType: "StockAdjustment",
            isActive: true,
            deletedAt: null,
            steps: [{ roleId: 3, userId: null }, { roleId: null, userId: null }],
          },
        ],
      }),
      ["StockAdjustment"],
    )
    const row = q.rows[0]
    expect(row).toMatchObject({ hasActiveWorkflow: true, stepsFilled: false, emptyStepCount: 1 })
    expect(row.observasi).toContain(APPROVAL_MATRIX_EMPTY_STEP_OBSERVASI)
    expect(q.langkahKosong).toBe(1)
    expect(q.terisi).toBe(0)
  })

  it("E146-3: requested_by tercatat approver (jejak) = SoD teramati; tanpa jejak = false", () => {
    const withTrail = evaluateApprovalMatrixCoverage(
      config({
        workflows: [{ modelType: "Journal", isActive: true, deletedAt: null, steps: [{ roleId: 9, userId: null }] }],
        approvals: [
          { referenceType: "Journal", referenceId: 7, status: "approved", requestedBy: 42, histories: [{ userId: 42 }] },
        ],
      }),
      ["Journal"],
    )
    expect(withTrail.rows[0].approverIsRequester).toBe(true)
    expect(withTrail.rows[0].observasi).toContain(APPROVAL_MATRIX_SOD_OBSERVASI)
    expect(withTrail.sodTeramati).toBe(1)
    expect(withTrail.terisi).toBe(0)

    const noTrail = evaluateApprovalMatrixCoverage(
      config({
        workflows: [{ modelType: "Journal", isActive: true, deletedAt: null, steps: [{ roleId: 9, userId: null }] }],
      }),
      ["Journal"],
    )
    expect(noTrail.rows[0].approverIsRequester).toBe(false)
    expect(noTrail.terisi).toBe(1)
  })

  it("E146-3: requester beda dari approver jejak = bukan SoD", () => {
    const q = evaluateApprovalMatrixCoverage(
      config({
        workflows: [{ modelType: "Journal", isActive: true, deletedAt: null, steps: [{ roleId: 9, userId: null }] }],
        approvals: [
          { referenceType: "Journal", referenceId: 8, status: "approved", requestedBy: 42, histories: [{ userId: 77 }] },
        ],
      }),
      ["Journal"],
    )
    expect(q.rows[0].approverIsRequester).toBe(false)
    expect(q.terisi).toBe(1)
  })

  it("daftar required input-driven: model di luar required tidak muncul", () => {
    const q = evaluateApprovalMatrixCoverage(
      config({ workflows: [{ modelType: "Journal", isActive: true, deletedAt: null, steps: [{ roleId: 1, userId: null }] }] }),
      ["VendorPayment"],
    )
    expect(q.rows.map((r) => r.modelType)).toEqual(["VendorPayment"])
    expect(q.rows[0].hasActiveWorkflow).toBe(false)
  })
})
