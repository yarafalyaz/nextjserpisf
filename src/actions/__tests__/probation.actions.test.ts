import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Aksi probation & keputusan kontrak F-2026-10-24-099-S: penjaga server
 * (izin, scope all-saja, SoD Employee, klaim transisi) di atas builder
 * murni probation.ts. Prisma + auth di-mock; logika penjaga NYATA.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getHrScope: vi.fn(),
  employeeFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  employeeUpdate: vi.fn(),
  reviewFindFirst: vi.fn(),
  reviewFindUnique: vi.fn(),
  reviewUpdate: vi.fn(),
  reviewUpdateMany: vi.fn(),
  reviewCreate: vi.fn(),
  requestFindUnique: vi.fn(),
  requestFindMany: vi.fn(),
  requestCreate: vi.fn(),
  requestUpdate: vi.fn(),
  requestUpdateMany: vi.fn(),
  requestCount: vi.fn(),
  transaction: vi.fn(),
  logActivity: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))
vi.mock("@/lib/auth/hr-scope", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/hr-scope")>()
  return { ...original, getHrScope: mocks.getHrScope }
})
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivity }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: {
      findUnique: mocks.employeeFindUnique,
      findFirst: mocks.employeeFindFirst,
      update: mocks.employeeUpdate,
    },
    probationReview: {
      findFirst: mocks.reviewFindFirst,
      findUnique: mocks.reviewFindUnique,
      update: mocks.reviewUpdate,
      updateMany: mocks.reviewUpdateMany,
      create: mocks.reviewCreate,
    },
    contractDecisionRequest: {
      findUnique: mocks.requestFindUnique,
      findMany: mocks.requestFindMany,
      create: mocks.requestCreate,
      update: mocks.requestUpdate,
      updateMany: mocks.requestUpdateMany,
      count: mocks.requestCount,
    },
    $transaction: mocks.transaction,
  },
}))

import {
  applyContractDecisionRequest,
  approveContractDecisionRequest,
  createContractDecisionRequest,
  decideProbation,
  openProbation,
  rejectContractDecisionRequest,
  saveProbationReviewDraft,
  submitContractDecisionRequest,
} from "../probation.actions"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

const user = { id: "10", roles: ["ga"] }

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Budi",
    employmentStatus: "PKWTT",
    joinDate: d("2026-01-05"),
    probationEndDate: null,
    contractStartDate: null,
    contractEndDate: null,
    employmentEndedAt: null,
    deletedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(user)
  mocks.getHrScope.mockResolvedValue({ kind: "all" })
  mocks.logActivity.mockResolvedValue(undefined)
  mocks.employeeFindFirst.mockResolvedValue({ id: 99 }) // pemanggil = Employee 99
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      probationReview: { update: mocks.reviewUpdate },
      employee: { update: mocks.employeeUpdate, findUnique: mocks.employeeFindUnique },
      contractDecisionRequest: {
        updateMany: mocks.requestUpdateMany,
        update: mocks.requestUpdate,
        count: mocks.requestCount,
      },
    }),
  )
})

describe("openProbation", () => {
  it("AC-PROB-2: PKWT/null ditolak server walau payload langsung", async () => {
    mocks.employeeFindUnique.mockResolvedValue(employeeRow({ employmentStatus: "PKWT" }))
    const r = await openProbation(1, "2026-04-05")
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/PKWTT/)
    expect(mocks.employeeUpdate).not.toHaveBeenCalled()

    mocks.employeeFindUnique.mockResolvedValue(employeeRow({ employmentStatus: null }))
    const r2 = await openProbation(1, "2026-04-05")
    expect(r2.success).toBe(false)
  })

  it("AC-PROB-1: PKWTT tepat 3 bulan tersimpan; +1 hari ditolak", async () => {
    mocks.employeeFindUnique.mockResolvedValue(employeeRow())
    expect(await openProbation(1, "2026-04-05")).toEqual({ success: true })
    expect(mocks.employeeUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { probationEndDate: d("2026-04-05") },
    })

    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(user)
    mocks.getHrScope.mockResolvedValue({ kind: "all" })
    mocks.employeeFindUnique.mockResolvedValue(employeeRow())
    const r = await openProbation(1, "2026-04-06")
    expect(r.success).toBe(false)
    expect(mocks.employeeUpdate).not.toHaveBeenCalled()
  })

  it("scope self tidak membuka percobaannya sendiri", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 1 })
    mocks.employeeFindUnique.mockResolvedValue(employeeRow())
    const r = await openProbation(1, "2026-04-05")
    expect(r.success).toBe(false)
  })
})

describe("decideProbation", () => {
  function setupDecide() {
    mocks.employeeFindUnique.mockResolvedValue(employeeRow({ probationEndDate: d("2026-04-05") }))
    mocks.reviewFindFirst.mockResolvedValue({ id: 5, status: "submitted", reviewerEmployeeId: 7 })
    mocks.reviewUpdate.mockResolvedValue({})
    mocks.employeeUpdate.mockResolvedValue({})
  }

  it("AC-PROB-4: tanpa review final submitted ditolak", async () => {
    mocks.employeeFindUnique.mockResolvedValue(employeeRow({ probationEndDate: d("2026-04-05") }))
    mocks.reviewFindFirst.mockResolvedValue({ id: 5, status: "draft", reviewerEmployeeId: 7 })
    const r = await decideProbation(1, "passed")
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/evaluasi final/)
    expect(mocks.reviewUpdate).not.toHaveBeenCalled()
  })

  it("scope department ditolak server (approve hanya all)", async () => {
    setupDecide()
    mocks.getHrScope.mockResolvedValue({ kind: "department", departmentId: 3, employeeId: 9 })
    const r = await decideProbation(1, "passed")
    expect(r.success).toBe(false)
    expect(mocks.reviewUpdate).not.toHaveBeenCalled()
  })

  it("SoD: penyetuju = penilai final ditolak", async () => {
    setupDecide()
    mocks.employeeFindFirst.mockResolvedValue({ id: 7 })
    const r = await decideProbation(1, "passed")
    expect(r.success).toBe(false)
  })

  it("passed: review decided + probationEndDate ditutup", async () => {
    setupDecide()
    expect(await decideProbation(1, "passed")).toEqual({ success: true })
    expect(mocks.reviewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ status: "decided", finalDecision: "passed" }),
      }),
    )
    expect(mocks.employeeUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { probationEndDate: null },
    })
  })

  it("extended: tanggal baru <= joinDate+3 bulan; lewat ditolak", async () => {
    setupDecide()
    mocks.employeeFindUnique.mockResolvedValue(
      employeeRow({ probationEndDate: d("2026-03-01") }),
    )
    // Final <90: slot final di probationEndDate; findFirst apa adanya cukup.
    expect(await decideProbation(1, "extended", "2026-04-05")).toEqual({ success: true })
    expect(mocks.employeeUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { probationEndDate: d("2026-04-05") },
    })
    const r = await decideProbation(1, "extended", "2026-04-06")
    expect(r.success).toBe(false)
  })
})

describe("saveProbationReviewDraft (F-5)", () => {
  const draftInput = {
    employeeId: 1,
    milestone: "30",
    reviewerEmployeeId: 7,
    technicalScore: null,
    disciplineScore: null,
    attendanceScore: null,
    notes: null,
    recommendation: null,
  }

  function setupDraft() {
    mocks.employeeFindUnique
      .mockResolvedValueOnce(employeeRow({ probationEndDate: d("2026-04-05") }))
      .mockResolvedValueOnce(employeeRow({ id: 7, name: "Penilai" }))
    mocks.reviewFindFirst.mockResolvedValue(null)
    mocks.reviewCreate.mockResolvedValue({})
  }

  it("penilai = diri sendiri ditolak", async () => {
    const r = await saveProbationReviewDraft({ ...draftInput, reviewerEmployeeId: 1 })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/Penilai tidak boleh/)
    expect(mocks.reviewCreate).not.toHaveBeenCalled()
  })

  it("penilai sudah berhenti ditolak", async () => {
    setupDraft()
    mocks.employeeFindUnique
      .mockReset()
      .mockResolvedValueOnce(employeeRow({ probationEndDate: d("2026-04-05") }))
      .mockResolvedValueOnce(employeeRow({ id: 7, employmentEndedAt: d("2026-02-01") }))
    const r = await saveProbationReviewDraft(draftInput)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/Penilai sudah berhenti/)
    expect(mocks.reviewCreate).not.toHaveBeenCalled()
  })

  it("penilai aktif lolos simpan draft", async () => {
    setupDraft()
    expect(await saveProbationReviewDraft(draftInput)).toEqual({ success: true })
    expect(mocks.reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reviewerEmployeeId: 7, status: "draft" }) }),
    )
  })
})

describe("createContractDecisionRequest + kumulatif", () => {
  function pkwtEmployee() {
    return employeeRow({
      employmentStatus: "PKWT",
      contractStartDate: d("2023-03-01"),
      contractEndDate: d("2025-02-28"),
    })
  }

  it("AC-PROB-6: usulan tepat 5 tahun lolos; +1 hari ditolak sebelum submitted", async () => {
    mocks.employeeFindUnique.mockResolvedValue(pkwtEmployee())
    mocks.requestFindMany.mockResolvedValue([
      { appliedFromStartDate: d("2021-03-01"), appliedEndDate: d("2023-02-28") },
    ])
    mocks.requestCreate.mockResolvedValue({})
    const okResult = await createContractDecisionRequest({
      employeeId: 1,
      kind: "extend_pkwt",
      proposedContractEndDate: "2026-03-01",
      reason: "Kebutuhan proyek berlanjut",
    })
    expect(okResult).toEqual({ success: true })

    const bad = await createContractDecisionRequest({
      employeeId: 1,
      kind: "extend_pkwt",
      proposedContractEndDate: "2026-03-02",
      reason: "Kebutuhan proyek berlanjut",
    })
    expect(bad.success).toBe(false)
    if (!bad.success) expect(bad.error).toMatch(/5 tahun/)
  })

  it("contractStartDate null fail-closed", async () => {
    mocks.employeeFindUnique.mockResolvedValue(pkwtEmployee())
    mocks.employeeFindUnique.mockResolvedValue({
      ...pkwtEmployee(),
      contractStartDate: null,
    })
    mocks.requestFindMany.mockResolvedValue([])
    const r = await createContractDecisionRequest({
      employeeId: 1,
      kind: "extend_pkwt",
      proposedContractEndDate: "2027-03-01",
      reason: "Perlu",
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/lengkapi data karyawan/i)
    expect(mocks.requestCreate).not.toHaveBeenCalled()
  })
})

describe("submit + approve + apply", () => {
  function submittedRequest(overrides: Record<string, unknown> = {}) {
    return {
      id: 3,
      employeeId: 1,
      kind: "extend_pkwt",
      proposedContractEndDate: d("2027-02-28"),
      requestedBy: 7,
      status: "submitted",
      finalReviewId: null,
      finalReview: null,
      ...overrides,
    }
  }

  it("F-2: create menurunkan finalReviewId dari review final submitted", async () => {
    mocks.employeeFindUnique.mockResolvedValue(
      employeeRow({
        employmentStatus: "PKWT",
        probationEndDate: d("2026-04-05"),
        contractStartDate: d("2025-03-01"),
        contractEndDate: d("2026-02-28"),
      }),
    )
    mocks.requestFindMany.mockResolvedValue([])
    mocks.reviewFindFirst.mockResolvedValue({ id: 5, status: "submitted", reviewerEmployeeId: 7 })
    mocks.requestCreate.mockResolvedValue({})
    const r = await createContractDecisionRequest({
      employeeId: 1,
      kind: "extend_pkwt",
      proposedContractEndDate: "2027-02-28",
      reason: "Kebutuhan proyek berlanjut",
    })
    expect(r).toEqual({ success: true })
    expect(mocks.requestCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ finalReviewId: 5 }) }),
    )
  })

  it("F-2: review final masih draft -> finalReviewId null", async () => {
    mocks.employeeFindUnique.mockResolvedValue(
      employeeRow({
        employmentStatus: "PKWT",
        probationEndDate: d("2026-04-05"),
        contractStartDate: d("2025-03-01"),
        contractEndDate: d("2026-02-28"),
      }),
    )
    mocks.requestFindMany.mockResolvedValue([])
    mocks.reviewFindFirst.mockResolvedValue({ id: 5, status: "draft", reviewerEmployeeId: 7 })
    mocks.requestCreate.mockResolvedValue({})
    const r = await createContractDecisionRequest({
      employeeId: 1,
      kind: "extend_pkwt",
      proposedContractEndDate: "2027-02-28",
      reason: "Kebutuhan proyek berlanjut",
    })
    expect(r).toEqual({ success: true })
    expect(mocks.requestCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ finalReviewId: null }) }),
    )
  })

  it("F-2: approver = penilai final yang dirujuk ditolak approve dan reject", async () => {
    mocks.requestFindUnique.mockResolvedValue(
      submittedRequest({ requestedBy: 8, finalReviewId: 5, finalReview: { reviewerEmployeeId: 7 } }),
    )
    mocks.employeeFindFirst.mockResolvedValue({ id: 7 })
    const rApprove = await approveContractDecisionRequest(3)
    expect(rApprove.success).toBe(false)
    if (!rApprove.success) expect(rApprove.error).toMatch(/penilai evaluasi final/)
    expect(mocks.requestUpdateMany).not.toHaveBeenCalled()

    const rReject = await rejectContractDecisionRequest(3, "Tidak disetujui")
    expect(rReject.success).toBe(false)
    if (!rReject.success) expect(rReject.error).toMatch(/penilai evaluasi final/)
    expect(mocks.requestUpdateMany).not.toHaveBeenCalled()
  })

  it.each(["submitted", "draft"])("F-3: apply dari status %s ditolak", async (status) => {
    mocks.requestFindUnique.mockResolvedValue(submittedRequest({ status }))
    const r = await applyContractDecisionRequest(3)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/sesudah disetujui/)
    expect(mocks.requestUpdateMany).not.toHaveBeenCalled()
    expect(mocks.employeeUpdate).not.toHaveBeenCalled()
  })

  it("F-3: klaim atomik apply count=0 ditolak walau status terbaca approved", async () => {
    mocks.requestFindUnique.mockResolvedValue(submittedRequest({ status: "approved" }))
    mocks.requestUpdateMany.mockResolvedValue({ count: 0 })
    const r = await applyContractDecisionRequest(3)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/sesudah disetujui/)
    expect(mocks.employeeUpdate).not.toHaveBeenCalled()
  })

  it("submit: maks 1 submitted per karyawan", async () => {
    mocks.requestFindUnique.mockResolvedValue({ ...submittedRequest({ status: "draft" }), reason: "Perlu" })
    mocks.employeeFindUnique.mockResolvedValue(
      employeeRow({
        employmentStatus: "PKWT",
        contractStartDate: d("2025-03-01"),
        contractEndDate: d("2026-02-28"),
      }),
    )
    mocks.requestFindMany.mockResolvedValue([])
    mocks.requestCount.mockResolvedValue(1)
    const r = await submitContractDecisionRequest(3)
    expect(r.success).toBe(false)
    expect(mocks.requestUpdateMany).not.toHaveBeenCalled()
  })

  it("AC-PROB-7: self-approve ditolak (Employee id, bukan userId)", async () => {
    mocks.requestFindUnique.mockResolvedValue(submittedRequest())
    mocks.employeeFindFirst.mockResolvedValue({ id: 7 })
    const r = await approveContractDecisionRequest(3)
    expect(r.success).toBe(false)
    expect(mocks.requestUpdateMany).not.toHaveBeenCalled()
  })

  it("approve lolos untuk pihak ketiga scope all", async () => {
    mocks.requestFindUnique.mockResolvedValue(submittedRequest())
    mocks.employeeFindUnique.mockResolvedValue(
      employeeRow({
        employmentStatus: "PKWT",
        contractStartDate: d("2025-03-01"),
        contractEndDate: d("2026-02-28"),
      }),
    )
    mocks.requestFindMany.mockResolvedValue([])
    mocks.requestUpdateMany.mockResolvedValue({ count: 1 })
    expect(await approveContractDecisionRequest(3)).toEqual({ success: true })
  })

  it("BR-PROB-10: apply memakai tanggal approved persis, bukan payload", async () => {
    mocks.requestFindUnique.mockResolvedValue(submittedRequest({ status: "approved" }))
    mocks.employeeFindUnique.mockResolvedValue(
      employeeRow({
        employmentStatus: "PKWT",
        contractStartDate: d("2025-03-01"),
        contractEndDate: d("2026-02-28"),
      }),
    )
    mocks.requestUpdateMany.mockResolvedValue({ count: 1 })
    mocks.requestUpdate.mockResolvedValue({})
    expect(await applyContractDecisionRequest(3)).toEqual({ success: true })
    expect(mocks.employeeUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { contractEndDate: d("2027-02-28") },
    })
    expect(mocks.requestUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { appliedFromStartDate: d("2025-03-01"), appliedEndDate: d("2027-02-28") },
    })
  })

  it("convert_pkwtt TIDAK membuka probation (probationEndDate utuh)", async () => {
    mocks.requestFindUnique.mockResolvedValue(
      submittedRequest({ status: "approved", kind: "convert_pkwtt", proposedContractEndDate: null }),
    )
    mocks.employeeFindUnique.mockResolvedValue(
      employeeRow({ employmentStatus: "PKWT", probationEndDate: null }),
    )
    mocks.requestUpdateMany.mockResolvedValue({ count: 1 })
    expect(await applyContractDecisionRequest(3)).toEqual({ success: true })
    expect(mocks.employeeUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { employmentStatus: "PKWTT", contractEndDate: null },
    })
  })
})
