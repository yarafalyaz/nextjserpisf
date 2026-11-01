import { beforeEach, describe, expect, it, vi } from "vitest"

const vacancyCreate = vi.fn()
const vacancyFindFirst = vi.fn()
const vacancyUpdate = vi.fn()
const vacancyUpdateMany = vi.fn()
const applicantCreate = vi.fn()
const applicantFindFirst = vi.fn()
const applicantUpdate = vi.fn()
const historyCreate = vi.fn()
const employeeCreate = vi.fn()

const txMock = {
  $executeRaw: vi.fn(async () => 1),
  jobVacancy: {
    findFirst: (...a: unknown[]) => vacancyFindFirst(...a),
    update: (...a: unknown[]) => vacancyUpdate(...a),
  },
  jobApplicant: {
    create: (...a: unknown[]) => applicantCreate(...a),
    findFirst: (...a: unknown[]) => applicantFindFirst(...a),
    update: (...a: unknown[]) => applicantUpdate(...a),
  },
  employee: { create: (...a: unknown[]) => employeeCreate(...a) },
  applicantStageHistory: { create: (...a: unknown[]) => historyCreate(...a) },
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    jobVacancy: {
      create: (...a: unknown[]) => vacancyCreate(...a),
      findFirst: (...a: unknown[]) => vacancyFindFirst(...a),
      update: (...a: unknown[]) => vacancyUpdate(...a),
      updateMany: (...a: unknown[]) => vacancyUpdateMany(...a),
    },
    jobApplicant: {
      create: (...a: unknown[]) => applicantCreate(...a),
      findFirst: (...a: unknown[]) => applicantFindFirst(...a),
      update: (...a: unknown[]) => applicantUpdate(...a),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    applicantStageHistory: { create: (...a: unknown[]) => historyCreate(...a) },
    employee: { create: (...a: unknown[]) => employeeCreate(...a) },
    $transaction: async (fn: (tx: typeof txMock) => unknown) => fn(txMock),
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: async () => ({ id: "7", roles: ["ga"] }),
  hasPermission: async () => true,
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: async (prefix: string) => `${prefix}-0001`,
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: async () => "test-slug" }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: async () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import {
  createApplicant,
  createVacancy,
  hireApplicant,
  moveApplicantStage,
  setVacancyStatus,
  updateVacancy,
} from "../recruitment.actions"

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("recruitment actions", () => {
  it("creates a vacancy in draft with a generated code", async () => {
    vacancyCreate.mockResolvedValue({ id: 5, slug: "test-slug", title: "Welder" })
    const res = await createVacancy(form({ title: "Welder", quota: "2" }))
    expect(res.success).toBe(true)
    expect(vacancyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: "VAC-0001", status: "draft", quota: 2 }),
      }),
    )
  })

  it("rejects applicants for a vacancy that is not open", async () => {
    vacancyFindFirst.mockResolvedValue({ id: 3, status: "draft" })
    const res = await createApplicant(form({ vacancyId: "3", name: "Budi" }))
    expect(res.success).toBe(false)
    expect(applicantCreate).not.toHaveBeenCalled()
  })

  it("adds an applicant to an open vacancy and records the first stage", async () => {
    vacancyFindFirst.mockResolvedValue({ id: 3, status: "open" })
    applicantCreate.mockResolvedValue({ id: 9, name: "Budi" })
    const res = await createApplicant(form({ vacancyId: "3", name: "Budi" }))
    expect(res.success).toBe(true)
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ applicantId: 9, fromStage: null, toStage: "applied" }),
      }),
    )
  })

  it("refuses to move a stage directly to hired", async () => {
    const res = await moveApplicantStage(9, "hired")
    expect(res.success).toBe(false)
  })

  it("moves a stage and writes history", async () => {
    applicantFindFirst.mockResolvedValue({ id: 9, stage: "applied", name: "Budi" })
    const res = await moveApplicantStage(9, "interview")
    expect(res.success).toBe(true)
    expect(applicantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stage: "interview" } }),
    )
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromStage: "applied", toStage: "interview" }),
      }),
    )
  })

  it("menolak tahap bila bacaan segar di bawah kunci sudah hired (lawan hireApplicant)", async () => {
    applicantFindFirst
      .mockResolvedValueOnce({ id: 9 })
      .mockResolvedValueOnce({ id: 9, stage: "hired", name: "Budi" })
    const res = await moveApplicantStage(9, "rejected")
    expect(res.success).toBe(false)
    expect(applicantUpdate).not.toHaveBeenCalled()
    expect(historyCreate).not.toHaveBeenCalled()
    const lockCall = (txMock.$executeRaw.mock.calls as unknown[][])[0]?.[0] as { sql?: string; strings?: string[] } | string[]
    const sql = Array.isArray(lockCall) ? lockCall.join("?") : (lockCall?.sql ?? lockCall?.strings?.join("?") ?? "")
    expect(sql).toContain("job_applicants")
    expect(sql).toContain("FOR UPDATE")
  })

  it("hiring creates the employee and links the applicant", async () => {
    applicantFindFirst.mockResolvedValue({
      id: 9,
      stage: "offering",
      name: "Budi",
      email: "budi@example.com",
      phone: "0812",
      hiredEmployeeId: null,
      vacancy: { departmentId: 1, positionId: 3 },
    })
    employeeCreate.mockResolvedValue({ id: 42, employeeNo: "EMP-0001" })

    const res = await hireApplicant(9)
    expect(res.success).toBe(true)
    expect(employeeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Budi",
          departmentId: 1,
          positionId: 3,
          employeeNo: "EMP-0001",
        }),
      }),
    )
    expect(applicantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: "hired", hiredEmployeeId: 42 }),
      }),
    )
  })

  it("hiring twice is rejected", async () => {
    applicantFindFirst.mockResolvedValue({
      id: 9,
      stage: "hired",
      name: "Budi",
      hiredEmployeeId: 42,
      vacancy: { departmentId: 1, positionId: 3 },
    })
    const res = await hireApplicant(9)
    expect(res.success).toBe(false)
    expect(employeeCreate).not.toHaveBeenCalled()
  })

  it("vacancy status only moves draft->open->closed", async () => {
    vacancyFindFirst.mockResolvedValue({ id: 3, status: "draft" })
    const res = await setVacancyStatus(3, "closed")
    expect(res.success).toBe(false)
    expect(vacancyUpdate).not.toHaveBeenCalled()
  })

  it("regresi putaran 16: updateVacancy mengunci baris job_vacancies sebelum cek status", async () => {
    vacancyFindFirst.mockResolvedValue({ id: 3, status: "open" })
    const res = await updateVacancy(3, form({ title: "Welder", quota: "2" }))
    expect(res.success).toBe(true)
    const lockCall = (txMock.$executeRaw.mock.calls as unknown[][])[0]?.[0] as { sql?: string; strings?: string[] } | string[]
    const sql = Array.isArray(lockCall) ? lockCall.join("?") : (lockCall?.sql ?? lockCall?.strings?.join("?") ?? "")
    expect(sql).toContain("job_vacancies")
    expect(sql).toContain("FOR UPDATE")
    const lockOrder = txMock.$executeRaw.mock.invocationCallOrder[0]
    const readOrder = (vacancyFindFirst.mock as { invocationCallOrder: number[] }).invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(readOrder)
    expect(vacancyUpdate).toHaveBeenCalledTimes(1)
  })

  it("regresi putaran 16: updateVacancy menolak lowongan yang dibaca ulang sudah closed", async () => {
    vacancyFindFirst.mockResolvedValue({ id: 3, status: "closed" })
    const res = await updateVacancy(3, form({ title: "Welder", quota: "2" }))
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/sudah ditutup/)
    expect(vacancyUpdate).not.toHaveBeenCalled()
  })
})
