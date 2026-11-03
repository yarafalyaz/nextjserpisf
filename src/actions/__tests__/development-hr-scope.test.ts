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
  employeeFindFirst: vi.fn(),
  competencyFindUnique: vi.fn(),
  positionCompetencyUpsert: vi.fn(),
  positionFindUnique: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  trainingFindFirst: vi.fn(),
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
    employee: { findUnique: mocks.employeeFindUnique, findFirst: mocks.employeeFindFirst },
    competency: { findUnique: mocks.competencyFindUnique },
    position: { findUnique: mocks.positionFindUnique },
    $executeRaw: mocks.executeRaw,
    $transaction: mocks.transaction,
    positionCompetency: { findMany: mocks.positionCompetencyFindMany, upsert: mocks.positionCompetencyUpsert },
    employeeCompetency: { upsert: mocks.employeeCompetencyUpsert, findMany: mocks.employeeCompetencyFindMany },
    training: { findFirst: mocks.trainingFindFirst },
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
  setPositionCompetency,
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
  mocks.participantFindUnique.mockResolvedValue({ employeeId: 7, trainingId: 3 })
  mocks.participantUpdate.mockResolvedValue({})
  mocks.participantDelete.mockResolvedValue({})
  mocks.employeeFindFirst.mockResolvedValue({ id: 7 })
  mocks.competencyFindUnique.mockResolvedValue({ id: 2, deletedAt: null })
  mocks.positionCompetencyUpsert.mockResolvedValue({ id: 5 })
  mocks.trainingFindFirst.mockResolvedValue({ id: 3, status: "scheduled", deletedAt: null })
  mocks.positionFindUnique.mockResolvedValue({ id: 4 })
  mocks.executeRaw.mockResolvedValue(1)
  mocks.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      employee: { findFirst: mocks.employeeFindFirst },
      competency: { findUnique: mocks.competencyFindUnique },
      position: { findUnique: mocks.positionFindUnique },
      positionCompetency: { upsert: mocks.positionCompetencyUpsert },
      employeeCompetency: { upsert: mocks.employeeCompetencyUpsert },
      training: { findFirst: mocks.trainingFindFirst },
      trainingParticipant: {
        upsert: mocks.participantUpsert,
        findUnique: mocks.participantFindUnique,
        update: mocks.participantUpdate,
        delete: mocks.participantDelete,
      },
      $executeRaw: mocks.executeRaw,
    }),
  )
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

describe("gerbang hidup pengembangan (putaran 51)", () => {
  it("peserta ke pelatihan cancelled ditolak sebelum upsert", async () => {
    mocks.trainingFindFirst.mockResolvedValue({ id: 3, status: "cancelled", deletedAt: null })
    const res = await addTrainingParticipant(participantForm())
    expect(res.success).toBe(false)
    expect(mocks.participantUpsert).not.toHaveBeenCalled()
  })

  it("peserta ke pelatihan terhapus ditolak sebelum upsert", async () => {
    mocks.trainingFindFirst.mockResolvedValue(null)
    const res = await addTrainingParticipant(participantForm())
    expect(res.success).toBe(false)
    expect(mocks.participantUpsert).not.toHaveBeenCalled()
  })

  it("penilaian atas kompetensi terhapus ditolak sebelum upsert", async () => {
    mocks.competencyFindUnique.mockResolvedValue({ id: 2, deletedAt: new Date() })
    const res = await assessEmployeeCompetency(competencyForm())
    expect(res.success).toBe(false)
    expect(mocks.employeeCompetencyUpsert).not.toHaveBeenCalled()
  })

  it("penilaian atas karyawan nonaktif ditolak sebelum upsert", async () => {
    mocks.employeeFindFirst.mockResolvedValue(null)
    const res = await assessEmployeeCompetency(competencyForm())
    expect(res.success).toBe(false)
    expect(mocks.employeeCompetencyUpsert).not.toHaveBeenCalled()
  })

  it("syarat jabatan atas kompetensi terhapus ditolak sebelum upsert", async () => {
    mocks.competencyFindUnique.mockResolvedValue({ id: 2, deletedAt: new Date() })
    const fd = new FormData()
    fd.set("positionId", "4")
    fd.set("competencyId", "2")
    fd.set("requiredLevel", "3")
    const res = await setPositionCompetency(fd)
    expect(res.success).toBe(false)
    expect(mocks.positionCompetencyUpsert).not.toHaveBeenCalled()
  })

  it("putaran 70: syarat jabatan atas posisi tak ada ditolak sebelum upsert", async () => {
    mocks.positionFindUnique.mockResolvedValue(null)
    const fd = new FormData()
    fd.set("positionId", "4")
    fd.set("competencyId", "2")
    fd.set("requiredLevel", "3")
    const res = await setPositionCompetency(fd)
    expect(res.success).toBe(false)
    expect(String(!res.success && res.error)).toContain("Jabatan")
    expect(mocks.positionCompetencyUpsert).not.toHaveBeenCalled()
  })

  it("putaran 70: gerbang kompetensi dinilai ulang dalam tx sesudah kunci baris", async () => {
    // Bacaan pra-tx: hidup; bacaan dalam tx: sudah terhapus. Upsert wajib
    // berhenti — snapshot pra-tx tidak boleh menjadi dasar tulis.
    mocks.competencyFindUnique
      .mockResolvedValueOnce({ id: 2, deletedAt: null })
      .mockResolvedValue({ id: 2, deletedAt: new Date() })
    const res = await assessEmployeeCompetency(competencyForm())
    expect(res.success).toBe(false)
    expect(mocks.employeeCompetencyUpsert).not.toHaveBeenCalled()
    expect(mocks.executeRaw.mock.invocationCallOrder.length).toBeGreaterThan(0)
  })

  it("putaran 70: gerbang karyawan dinilai ulang dalam tx sesudah kunci baris", async () => {
    mocks.employeeFindFirst
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValue(null)
    const res = await assessEmployeeCompetency(competencyForm())
    expect(res.success).toBe(false)
    expect(mocks.employeeCompetencyUpsert).not.toHaveBeenCalled()
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

describe("putaran 78: roster pelatihan dinilai ulang berkunci", () => {
  it("status training berubah dalam tx menolak tambah peserta, kunci mendahului bacaan", async () => {
    mocks.trainingFindFirst.mockResolvedValue({ id: 3, status: "done" })
    const res = await addTrainingParticipant(participantForm())
    expect(res.success).toBe(false)
    expect(mocks.participantUpsert).not.toHaveBeenCalled()
    expect(mocks.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.trainingFindFirst.mock.invocationCallOrder[0],
    )
  })

  it("hasil peserta pada pelatihan done ditolak tanpa update", async () => {
    mocks.trainingFindFirst.mockResolvedValue({ id: 3, status: "done" })
    const res = await setParticipantResult(5, { status: "attended", score: 80 })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/terjadwal/)
    expect(mocks.participantUpdate).not.toHaveBeenCalled()
  })

  it("hapus peserta pada pelatihan cancelled ditolak tanpa delete", async () => {
    mocks.trainingFindFirst.mockResolvedValue({ id: 3, status: "cancelled" })
    const res = await removeTrainingParticipant(5)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/terjadwal/)
    expect(mocks.participantDelete).not.toHaveBeenCalled()
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
