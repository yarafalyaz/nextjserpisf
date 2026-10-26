import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Pencatatan keputusan BR-DISC-09.
 *
 * Prisma, auth, ActivityLog, dan next/cache di-mock; service dan builder
 * dijalankan nyata supaya pesan guard service terbukti tampil verbatim.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getHrScope: vi.fn(),
  decisionCreate: vi.fn(),
  employeeFindUnique: vi.fn(),
  recordFindFirst: vi.fn(),
  nextSlug: vi.fn(),
  logActivity: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))
vi.mock("@/lib/auth/hr-scope", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/hr-scope")>()
  return { ...original, getHrScope: mocks.getHrScope }
})
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivity }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: mocks.nextSlug }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: { findUnique: mocks.employeeFindUnique },
    employeeDisciplinaryRecord: { findFirst: mocks.recordFindFirst },
    disciplinaryDeductionDecision: { create: mocks.decisionCreate },
  },
}))

import { createDisciplinaryDeductionDecisionAction } from "../disciplinary-deduction.actions"

const user = { id: "10", roles: ["ga"] }
const input = {
  documentNo: "KEP-HR/2026/010",
  decidedAt: "2026-10-20",
  employeeId: 42,
  kind: "denda",
  amount: 500_000,
  signedBy: 3,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(user)
  mocks.getHrScope.mockResolvedValue({ kind: "all" })
  mocks.logActivity.mockResolvedValue(undefined)
  mocks.nextSlug.mockResolvedValue("kep-hr-2026-010")
  mocks.employeeFindUnique.mockImplementation(async ({ where }: { where: { id: number } }) => ({
    id: where.id,
    departmentId: 7,
    deletedAt: null,
  }))
  mocks.recordFindFirst.mockResolvedValue({ id: 5 })
  mocks.decisionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 9,
    ...data,
    amount: { toString: () => String(data.amount) },
  }))
})

describe("createDisciplinaryDeductionDecisionAction", () => {
  it("mencatat keputusan sah lewat service, log tanpa nominal, dan revalidate", async () => {
    const result = await createDisciplinaryDeductionDecisionAction(input)

    expect(result).toEqual({ success: true })
    expect(mocks.requirePermission).toHaveBeenCalledWith("create_disciplinary_records")
    expect(mocks.decisionCreate).toHaveBeenCalledTimes(1)
    expect(mocks.decisionCreate.mock.calls[0][0].data).toMatchObject({
      documentNo: "KEP-HR/2026/010",
      employeeId: 42,
      disciplinaryRecordId: null,
      kind: "denda",
      amount: 500_000,
      compensationAccountId: null,
      signedBy: 3,
      createdBy: 10,
    })
    expect(mocks.logActivity).toHaveBeenCalledWith(
      "create",
      "DisciplinaryDeductionDecision",
      9,
      "Mencatat dokumen keputusan potongan disiplin",
    )
    expect(mocks.logActivity.mock.calls[0][3]).not.toContain("500")
    expect(mocks.logActivity.mock.calls[0][3]).not.toContain("KEP-HR")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/sdm/disiplin")
  })

  it("scope department gagal tertutup untuk karyawan luar departemen", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "department", departmentId: 9, employeeId: 99 })
    const result = await createDisciplinaryDeductionDecisionAction(input)

    expect(result).toEqual({
      success: false,
      error: "Anda tidak memiliki akses ke data karyawan ini",
    })
    expect(mocks.decisionCreate).not.toHaveBeenCalled()
  })

  it("scope self ditolak untuk mencatat keputusan karyawan lain", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 1 })
    const result = await createDisciplinaryDeductionDecisionAction(input)

    expect(result).toEqual({
      success: false,
      error: "Anda tidak memiliki akses ke data karyawan ini",
    })
    expect(mocks.decisionCreate).not.toHaveBeenCalled()
  })

  it("error service tampil verbatim: ganti rugi tanpa akun kompensasi", async () => {
    const result = await createDisciplinaryDeductionDecisionAction({
      ...input,
      kind: "ganti_rugi",
      compensationAccountId: null,
    })

    expect(result).toEqual({
      success: false,
      error: "Keputusan ganti rugi wajib menyebut akun kompensasi terkait dokumennya (bukan 710006).",
    })
    expect(mocks.decisionCreate).not.toHaveBeenCalled()
  })

  it("error service tampil verbatim: skorsing disiplin tanpa klausul", async () => {
    const result = await createDisciplinaryDeductionDecisionAction({
      ...input,
      suspensionKind: "disiplin",
      suspensionPayTreatment: "tidak_dibayar",
      regulationReference: null,
    })

    expect(result).toEqual({
      success: false,
      error: "Skorsing disiplin wajib menyebut klausul PK/PP/PKB pada dokumen keputusan",
    })
    expect(mocks.decisionCreate).not.toHaveBeenCalled()
  })

  it("konteks SP milik karyawan lain ditolak sebelum service create", async () => {
    mocks.recordFindFirst.mockResolvedValue(null)
    const result = await createDisciplinaryDeductionDecisionAction({
      ...input,
      disciplinaryRecordId: 8,
    })

    expect(result).toEqual({
      success: false,
      error: "Rekod disiplin konteks tidak ditemukan untuk karyawan ini",
    })
    expect(mocks.recordFindFirst).toHaveBeenCalledWith({
      where: { id: 8, employeeId: 42, deletedAt: null },
      select: { id: true },
    })
    expect(mocks.decisionCreate).not.toHaveBeenCalled()
  })

  it("penandatangan terhapus ditolak sebelum service create", async () => {
    mocks.employeeFindUnique.mockImplementation(async ({ where }: { where: { id: number } }) => {
      if (where.id === 3) return { id: 3, deletedAt: new Date("2026-10-01T00:00:00Z") }
      return { id: where.id, departmentId: 7, deletedAt: null }
    })

    const result = await createDisciplinaryDeductionDecisionAction(input)

    expect(result).toEqual({
      success: false,
      error: "Pejabat penandatangan keputusan tidak ditemukan",
    })
    expect(mocks.decisionCreate).not.toHaveBeenCalled()
  })
})
