import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getHrScope: vi.fn(),
  employeeCompetencyUpsert: vi.fn(),
  participantUpsert: vi.fn(),
  participantFindUnique: vi.fn(),
  participantUpdate: vi.fn(),
  participantDelete: vi.fn(),
  employeeFindUnique: vi.fn(),
  positionCompetencyFindMany: vi.fn(),
  employeeCompetencyFindMany: vi.fn(),
  logActivity: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))
vi.mock("@/lib/auth/hr-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/hr-scope")>()
  return { ...actual, getHrScope: mocks.getHrScope }
})
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: { findUnique: mocks.employeeFindUnique },
    positionCompetency: { findMany: mocks.positionCompetencyFindMany },
    employeeCompetency: { upsert: mocks.employeeCompetencyUpsert, findMany: mocks.employeeCompetencyFindMany },
    trainingParticipant: {
      upsert: mocks.participantUpsert,
      findUnique: mocks.participantFindUnique,
      update: mocks.participantUpdate,
      delete: mocks.participantDelete,
    },
  },
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivity,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import {
  addTrainingParticipant,
  assessEmployeeCompetency,
  getCompetencyGaps,
  removeTrainingParticipant,
  setParticipantResult,
} from "../development.actions"

const actor = { id: "9", roles: ["ga"] }

function competencyForm() {
  const fd = new FormData()
  fd.set("employeeId", "7")
  fd.set("competencyId", "2")
  fd.set("level", "3")
  return fd
}

function participantForm() {
  const fd = new FormData()
  fd.set("trainingId", "3")
  fd.set("employeeId", "7")
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(actor)
  mocks.getHrScope.mockResolvedValue({ kind: "all" })
  mocks.employeeCompetencyUpsert.mockResolvedValue({ id: 5 })
  mocks.participantUpsert.mockResolvedValue({ id: 5 })
  mocks.participantFindUnique.mockResolvedValue({ employeeId: 7 })
  mocks.participantUpdate.mockResolvedValue({})
  mocks.participantDelete.mockResolvedValue({})
  mocks.logActivity.mockResolvedValue(undefined)
})

describe("assessEmployeeCompetency HR scope", () => {
  it("scope department menolak karyawan luar departemen, upsert tidak dipanggil", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "department", departmentId: 3, employeeId: 30 })
    mocks.employeeFindUnique.mockResolvedValue({ departmentId: 99 })
    const res = await assessEmployeeCompetency(competencyForm())
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("tidak memiliki akses")
    expect(mocks.employeeCompetencyUpsert).not.toHaveBeenCalled()
  })

  it("scope self menolak karyawan lain, upsert tidak dipanggil", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 30 })
    const res = await assessEmployeeCompetency(competencyForm())
    expect(res.success).toBe(false)
    expect(mocks.employeeCompetencyUpsert).not.toHaveBeenCalled()
  })

  it("scope all tetap lolos", async () => {
    const res = await assessEmployeeCompetency(competencyForm())
    expect(res.success).toBe(true)
    expect(mocks.employeeCompetencyUpsert).toHaveBeenCalled()
  })
})

describe("getCompetencyGaps HR scope (ROUND5-SCOPE)", () => {
  it("scope self menolak karyawan lain sebelum data dibaca", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 30 })
    await expect(getCompetencyGaps(7)).rejects.toThrow("tidak memiliki akses")
    expect(mocks.positionCompetencyFindMany).not.toHaveBeenCalled()
  })

  it("scope all tetap membaca gap", async () => {
    mocks.employeeFindUnique.mockResolvedValue({ positionId: 3 })
    mocks.positionCompetencyFindMany.mockResolvedValue([
      { competencyId: 2, requiredLevel: 4, competency: { name: "Las" }, position: { name: "Teknisi" } },
    ])
    mocks.employeeCompetencyFindMany.mockResolvedValue([{ competencyId: 2, level: 1 }])
    const gaps = await getCompetencyGaps(7)
    expect(gaps).toEqual([
      { competencyId: 2, competencyName: "Las", requiredLevel: 4, currentLevel: 1, gap: 3 },
    ])
  })
})

describe("addTrainingParticipant HR scope", () => {
  it("scope department menolak karyawan luar departemen, upsert tidak dipanggil", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "department", departmentId: 3, employeeId: 30 })
    mocks.employeeFindUnique.mockResolvedValue({ departmentId: 99 })
    const res = await addTrainingParticipant(participantForm())
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("tidak memiliki akses")
    expect(mocks.participantUpsert).not.toHaveBeenCalled()
  })

  it("scope self menolak karyawan lain, upsert tidak dipanggil", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 30 })
    const res = await addTrainingParticipant(participantForm())
    expect(res.success).toBe(false)
    expect(mocks.participantUpsert).not.toHaveBeenCalled()
  })

  it("scope all tetap lolos", async () => {
    const res = await addTrainingParticipant(participantForm())
    expect(res.success).toBe(true)
    expect(mocks.participantUpsert).toHaveBeenCalled()
  })
})

describe("setParticipantResult HR scope", () => {
  it("scope department menolak peserta luar departemen, update tidak dipanggil", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "department", departmentId: 3, employeeId: 30 })
    mocks.employeeFindUnique.mockResolvedValue({ departmentId: 99 })
    const res = await setParticipantResult(5, { status: "attended", score: 80 })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("tidak memiliki akses")
    expect(mocks.participantUpdate).not.toHaveBeenCalled()
  })

  it("scope self menolak peserta karyawan lain, update tidak dipanggil", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 30 })
    const res = await setParticipantResult(5, { status: "attended", score: 80 })
    expect(res.success).toBe(false)
    expect(mocks.participantUpdate).not.toHaveBeenCalled()
  })

  it("scope all tetap lolos", async () => {
    const res = await setParticipantResult(5, { status: "attended", score: 80 })
    expect(res.success).toBe(true)
    expect(mocks.participantUpdate).toHaveBeenCalled()
  })
})

describe("removeTrainingParticipant HR scope", () => {
  it("scope department menolak peserta luar departemen, delete tidak dipanggil", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "department", departmentId: 3, employeeId: 30 })
    mocks.employeeFindUnique.mockResolvedValue({ departmentId: 99 })
    const res = await removeTrainingParticipant(5)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("tidak memiliki akses")
    expect(mocks.participantDelete).not.toHaveBeenCalled()
  })

  it("scope self menolak peserta karyawan lain, delete tidak dipanggil", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 30 })
    const res = await removeTrainingParticipant(5)
    expect(res.success).toBe(false)
    expect(mocks.participantDelete).not.toHaveBeenCalled()
  })

  it("scope all tetap lolos", async () => {
    const res = await removeTrainingParticipant(5)
    expect(res.success).toBe(true)
    expect(mocks.participantDelete).toHaveBeenCalledWith({ where: { id: 5 } })
  })
})
