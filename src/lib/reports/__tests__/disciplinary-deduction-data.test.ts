import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Loader snapshot BR-DISC-09: scope HR pada query yang sama (fail-closed),
 * gating nominal di server (tanpa izin payroll payload tanpa nominal),
 * snapshot tampil verbatim tanpa turunan.
 */

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { disciplinaryDeductionDecision: { findMany: mocks.findMany } },
}))

import {
  loadDisciplinaryDeductionDecisions,
  loadDisciplinaryDeductionDecisionsForRecord,
} from "../disciplinary-deduction-data"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    documentNo: "KEP-001/2026",
    decidedAt: d("2026-10-10"),
    employeeId: 42,
    disciplinaryRecordId: 5,
    kind: "denda",
    amount: "250000.00",
    suspensionKind: "disiplin",
    suspensionPayTreatment: "tidak_dibayar",
    regulationReference: "PP Bab V Pasal 12",
    employee: { name: "Budi Santoso", department: { name: "Bengkel" } },
    signer: { name: "Direktur" },
    disciplinaryRecord: { documentNo: "001/SP/YRA/10/2026" },
    compensationAccount: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([row()])
})

describe("loadDisciplinaryDeductionDecisions", () => {
  it("scope self membatasi employeeId pada where query yang sama", async () => {
    await loadDisciplinaryDeductionDecisions({ kind: "self", employeeId: 42 }, true)
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, employeeId: 42 } }),
    )
  })

  it("scope department membatasi lewat relasi employee.departmentId", async () => {
    await loadDisciplinaryDeductionDecisions({ kind: "department", departmentId: 3, employeeId: 9 }, true)
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, employee: { departmentId: 3 } } }),
    )
  })

  it("snapshot verbatim: nominal dari Decimal, label akun, konteks SP", async () => {
    mocks.findMany.mockResolvedValue([
      row({ compensationAccount: { code: "510099", name: "Kompensasi Lain" } }),
    ])
    const [decision] = await loadDisciplinaryDeductionDecisions({ kind: "all" }, true)
    expect(decision.amount).toBe(250000)
    expect(decision.kind).toBe("denda")
    expect(decision.suspensionKind).toBe("disiplin")
    expect(decision.suspensionPayTreatment).toBe("tidak_dibayar")
    expect(decision.regulationReference).toBe("PP Bab V Pasal 12")
    expect(decision.compensationAccountLabel).toBe("510099 — Kompensasi Lain")
    expect(decision.contextDocumentNo).toBe("001/SP/YRA/10/2026")
    expect(decision.signerName).toBe("Direktur")
  })

  it("tanpa izin nominal: payload amount null (gating server, bukan client)", async () => {
    const [decision] = await loadDisciplinaryDeductionDecisions({ kind: "all" }, false)
    expect(decision.amount).toBeNull()
    expect(decision.documentNo).toBe("KEP-001/2026")
  })

  it("konteks rekod: where memuat disciplinaryRecordId + scope sama", async () => {
    await loadDisciplinaryDeductionDecisionsForRecord({ kind: "self", employeeId: 42 }, 5, true)
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, employeeId: 42, disciplinaryRecordId: 5 },
      }),
    )
  })
})
