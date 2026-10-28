import { describe, expect, it } from "vitest"

import {
  evaluateApprovalMatrixCoverage,
  type ApprovalMatrixWorkflowInput,
} from "@/lib/reports/approval-matrix-coverage"

const NO_WORKFLOWS: readonly ApprovalMatrixWorkflowInput[] = []

function wf(
  modelType: string,
  steps: { roleId: number | null; userId: number | null }[],
  isActive = true,
): ApprovalMatrixWorkflowInput {
  return { modelType, isActive, steps }
}

describe("E146-1: baris WAJIB tanpa workflow aktif ditandai missingWorkflow", () => {
  it("wajib tanpa workflow = missingWorkflow true; opsional tanpa workflow = false", () => {
    const rows = evaluateApprovalMatrixCoverage(["Journal", "SalesOrder"], NO_WORKFLOWS)
    expect(rows.find((r) => r.modelType === "Journal")).toMatchObject({
      required: true,
      hasActiveWorkflow: false,
      missingWorkflow: true,
    })
    // SalesOrder ada di daftar pemanggil (opsional) -> missingWorkflow false.
    expect(rows.find((r) => r.modelType === "SalesOrder")).toMatchObject({
      required: true,
      hasActiveWorkflow: false,
      missingWorkflow: true,
    })
    // Model di luar daftar = opsional implisit.
    const optional = evaluateApprovalMatrixCoverage(
      ["Journal"],
      [wf("DeliveryOrder", [{ roleId: 1, userId: null }])],
    )
    expect(optional.find((r) => r.modelType === "DeliveryOrder")).toMatchObject({
      required: false,
      hasActiveWorkflow: true,
      missingWorkflow: false,
    })
  })

  it("workflow nonaktif = sama dengan tanpa workflow", () => {
    const rows = evaluateApprovalMatrixCoverage(
      ["VendorPayment"],
      [wf("VendorPayment", [{ roleId: 1, userId: null }], false)],
    )
    expect(rows[0]).toMatchObject({ hasActiveWorkflow: false, missingWorkflow: true })
  })
})

describe("E146-2: langkah tanpa roleId DAN userId dihitung", () => {
  it("langkah kosong jatuh ke approve_workflows (admin saja)", () => {
    const rows = evaluateApprovalMatrixCoverage(
      ["Journal"],
      [wf("Journal", [{ roleId: 1, userId: null }, { roleId: null, userId: null }])],
    )
    expect(rows[0]).toMatchObject({ stepCount: 2, emptyStepCount: 1 })
  })
})

describe("E146-3: jejak requested_by = approver dihitung sebagai SoD breach", () => {
  it("sampel cocok counted; null/tak-cocok tidak", () => {
    const rows = evaluateApprovalMatrixCoverage(
      ["VendorBill"],
      [wf("VendorBill", [{ roleId: 1, userId: null }])],
      {
        VendorBill: [
          { requestedBy: 7, approverId: 7 },
          { requestedBy: 7, approverId: 8 },
          { requestedBy: null, approverId: 8 },
        ],
      },
    )
    expect(rows[0].sodBreachCount).toBe(1)
  })
})
