import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Loader disiplin DISC-B1: scope HR diterapkan pada query yang sama
 * (AC-DISC-5 fail-closed) + select tanpa field gaji (BR-DISC-08/AC-DISC-8).
 */

const mocks = vi.hoisted(() => ({ recFindMany: vi.fn() }))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { employeeDisciplinaryRecord: { findMany: mocks.recFindMany } },
}))

import { loadDisciplinaryRecords } from "../disciplinary-data"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    employeeId: 1,
    level: "sp1",
    violationCategory: "mangkir tanpa keterangan berulang",
    violationDate: d("2026-01-05"),
    description: "Mangkir",
    regulationReference: null,
    workflowStatus: "issued",
    requestedBy: 7,
    approvedBy: 8,
    secondApprovedBy: null,
    issuedAt: d("2026-01-05"),
    documentNo: "001/SP/YRA/01/2026",
    rejectionReason: null,
    acknowledgmentAt: null,
    acknowledgmentMethod: null,
    acknowledgmentRefused: false,
    employeeResponse: null,
    employeeResponseAt: null,
    employeeResponseLate: false,
    voidOfId: null,
    voidedAt: null,
    voidReason: null,
    createdAt: d("2026-01-05"),
    employee: { name: "Budi", department: { name: "Bengkel" } },
    requester: { name: "Atasan" },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.recFindMany.mockResolvedValue([row()])
})

describe("loadDisciplinaryRecords", () => {
  it("AC-DISC-5: scope self membatasi employeeId pada where query yang sama", async () => {
    await loadDisciplinaryRecords({ kind: "self", employeeId: 42 })
    expect(mocks.recFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, employeeId: 42 },
      }),
    )
  })

  it("scope department membatasi lewat relasi employee.departmentId", async () => {
    await loadDisciplinaryRecords({ kind: "department", departmentId: 3, employeeId: 9 })
    expect(mocks.recFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, employee: { departmentId: 3 } },
      }),
    )
  })

  it("AC-DISC-8: select loader tidak memuat baseSalary/nominal apa pun", async () => {
    await loadDisciplinaryRecords({ kind: "all" })
    const arg = mocks.recFindMany.mock.calls[0][0] as { select: Record<string, unknown> }
    const serialized = JSON.stringify(arg.select)
    expect(serialized).not.toMatch(/baseSalary|salary|amount/)
    expect(arg.select.employee).toEqual({
      select: { name: true, department: { select: { name: true } } },
    })
  })

  it("status turunan: issued 5 Jan dibaca active 5 Jul, expired 6 Jul (BR-DISC-03)", async () => {
    const active = await loadDisciplinaryRecords({ kind: "all" }, d("2026-07-05"))
    expect(active[0].derivedStatus).toBe("active")
    expect(active[0].expiresAt).toEqual(d("2026-07-05"))
    const expired = await loadDisciplinaryRecords({ kind: "all" }, d("2026-07-06"))
    expect(expired[0].derivedStatus).toBe("expired")
  })
})
