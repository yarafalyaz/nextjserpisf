import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  COMPETENCY_GAP_BUCKET_LABELS,
  COMPETENCY_GAP_COLUMN_LABELS,
  COMPETENCY_GAP_CRITICAL_LABEL,
  COMPETENCY_GAP_CRITICAL_MIN,
  COMPETENCY_GAP_EMPTY_TEXT,
  COMPETENCY_GAP_NOTICE_TEXT,
  COMPETENCY_GAP_TITLE,
  buildCompetencyGapQueue,
  type CompetencyGapInput,
} from "../competency-gap-queue"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getHrScope: vi.fn(),
  findEmployees: vi.fn(),
  findRequirements: vi.fn(),
  findActuals: vi.fn(),
  createCompetency: vi.fn(),
  upsertActual: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...args: unknown[]) => mocks.requirePermission(...args),
}))
vi.mock("@/lib/auth/hr-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/hr-scope")>()
  return {
    ...actual,
    getHrScope: (...args: unknown[]) => mocks.getHrScope(...args),
  }
})
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: { findMany: (...a: unknown[]) => mocks.findEmployees(...a) },
    positionCompetency: {
      findMany: (...a: unknown[]) => mocks.findRequirements(...a),
    },
    employeeCompetency: {
      findMany: (...a: unknown[]) => mocks.findActuals(...a),
      upsert: (...a: unknown[]) => mocks.upsertActual(...a),
    },
    competency: { create: (...a: unknown[]) => mocks.createCompetency(...a) },
  },
}))

import { getCompetencyGapQueue } from "../competency-gap-queue-data"

const AT = new Date("2026-10-20T00:00:00.000Z")

function emp(
  employeeId: number,
  over: Partial<CompetencyGapInput["employees"][number]> = {},
) {
  return {
    employeeId,
    employeeName: `Karyawan ${employeeId}`,
    employeeDeletedAt: null,
    employeeIsActive: true,
    employeeEmploymentEndedAt: null,
    positionId: 10,
    positionName: "Mekanik",
    ...over,
  }
}

function input(over: Partial<CompetencyGapInput> = {}): CompetencyGapInput {
  return {
    employees: [emp(1), emp(2), emp(3), emp(4)],
    requirements: [
      { positionId: 10, competencyId: 100, competencyName: "Bongkar Mesin", competencyDeletedAt: null, requiredLevel: 4 },
      { positionId: 10, competencyId: 101, competencyName: "Kelistrikan", competencyDeletedAt: null, requiredLevel: 3 },
    ],
    actuals: [
      // 1: di bawah syarat gap 1 (tidak kritis); 2: di bawah gap 2 (kritis)
      { employeeId: 1, competencyId: 100, level: 3, assessedAt: AT },
      { employeeId: 2, competencyId: 100, level: 2, assessedAt: AT },
      // 3: memenuhi dua-duanya (rekap saja)
      { employeeId: 3, competencyId: 100, level: 4, assessedAt: AT },
      { employeeId: 3, competencyId: 101, level: 5, assessedAt: AT },
      // 4: belum dinilai kompetensi 100; memenuhi 101 tidak ada → belum
      { employeeId: 1, competencyId: 101, level: 3, assessedAt: AT },
    ],
    ...over,
  }
}

describe("competency-gap-queue builder (F-2026-10-27-078-S, Q-CGQ-1..8)", () => {
  it("kata tampil + notice + ambang kritis verbatim (Q-CGQ-2/3)", () => {
    expect(COMPETENCY_GAP_TITLE).toBe("Daftar Kesenjangan Kompetensi")
    expect(COMPETENCY_GAP_COLUMN_LABELS).toEqual({
      karyawan: "Karyawan",
      jabatan: "Jabatan",
      kompetensi: "Kompetensi",
      syarat: "Syarat",
      aktual: "Aktual",
      kesenjangan: "Kesenjangan",
      dinilai: "Dinilai",
    })
    expect(COMPETENCY_GAP_BUCKET_LABELS).toEqual({
      "belum-dinilai": "Belum Dinilai",
      "di-bawah-syarat": "Di Bawah Syarat",
      memenuhi: "Memenuhi Syarat",
    })
    expect(COMPETENCY_GAP_CRITICAL_LABEL).toBe("Kritis")
    expect(COMPETENCY_GAP_CRITICAL_MIN).toBe(2)
    expect(COMPETENCY_GAP_NOTICE_TEXT).toBe(
      "Daftar ini membandingkan level kompetensi aktual dengan syarat jabatan saat ini. Belum dinilai berbeda dari level rendah; daftar ini tidak memberi peringkat antar karyawan.",
    )
    expect(COMPETENCY_GAP_EMPTY_TEXT).toBe(
      "Tidak ada kesenjangan kompetensi.",
    )
  })

  it("AC-CGQ-B2: ember tepat; belum-dinilai currentLevel null bukan 0; memenuhi rekap saja", () => {
    const q = buildCompetencyGapQueue(input())
    const key = (r: (typeof q.rows)[number]) =>
      `${r.employeeId}:${r.competencyId}`
    const byKey = new Map(q.rows.map((r) => [key(r), r]))

    // Belum dinilai: 2×Kelistrikan? (emp2, emp4) + emp4 Bongkar
    const belum = q.rows.filter((r) => r.bucket === "belum-dinilai")
    expect(belum.length).toBeGreaterThan(0)
    for (const row of belum) {
      expect(row.currentLevel).toBeNull()
      expect(row.gap).toBeNull()
      expect(row.assessedAt).toBeNull()
      expect(row.isCritical).toBe(false)
      expect(row.criticalLabel).toBeNull()
    }
    // Di bawah syarat
    expect(byKey.get("1:100")).toMatchObject({
      bucket: "di-bawah-syarat",
      currentLevel: 3,
      gap: 1,
      isCritical: false,
      criticalLabel: null,
    })
    expect(byKey.get("2:100")).toMatchObject({
      bucket: "di-bawah-syarat",
      currentLevel: 2,
      gap: 2,
      isCritical: true,
      criticalLabel: "Kritis",
    })
    // Memenuhi tidak jadi baris
    expect(byKey.has("3:100")).toBe(false)
    expect(byKey.has("3:101")).toBe(false)
    expect(byKey.has("1:101")).toBe(false)
    expect(q.summary.memenuhi).toBe(3)
    expect(q.summary.kritis).toBe(1)
    expect(q.criticalMin).toBe(2)
  })

  it("Q-CGQ-3: urutan ember → kompetensi ↑ → karyawan ↑ → id; tanpa urutan gap", () => {
    const q = buildCompetencyGapQueue(
      input({
        employees: [
          emp(9, { employeeName: "Zeta" }),
          emp(5, { employeeName: "Beta" }),
          emp(7, { employeeName: "Beta" }),
        ],
        requirements: [
          { positionId: 10, competencyId: 102, competencyName: "Zulu", competencyDeletedAt: null, requiredLevel: 5 },
          { positionId: 10, competencyId: 100, competencyName: "Alpha", competencyDeletedAt: null, requiredLevel: 5 },
        ],
        actuals: [
          // gap besar untuk Zeta/Alpha — tidak boleh mengangkat urutan
          { employeeId: 9, competencyId: 100, level: 1, assessedAt: AT },
          { employeeId: 5, competencyId: 100, level: 4, assessedAt: AT },
        ],
      }),
    )
    expect(
      q.rows.map((r) => [r.bucket, r.competencyName, r.employeeId]),
    ).toEqual([
      ["belum-dinilai", "Alpha", 7],
      ["belum-dinilai", "Zulu", 5],
      ["belum-dinilai", "Zulu", 7],
      ["belum-dinilai", "Zulu", 9],
      ["di-bawah-syarat", "Alpha", 5],
      ["di-bawah-syarat", "Alpha", 9],
    ])
  })

  it("AC-CGQ-B3: populasi — nonaktif/berhenti/terhapus/kompetensi mati keluar; tanpa-syarat terhitung", () => {
    const q = buildCompetencyGapQueue(
      input({
        employees: [
          emp(1),
          emp(2, { employeeIsActive: false }),
          emp(3, { employeeEmploymentEndedAt: AT }),
          emp(4, { employeeDeletedAt: AT }),
          emp(5, { positionId: null, positionName: null }),
          emp(6, { positionId: 99, positionName: "Tanpa Syarat" }),
        ],
        requirements: [
          { positionId: 10, competencyId: 100, competencyName: "Hidup", competencyDeletedAt: null, requiredLevel: 4 },
          { positionId: 10, competencyId: 101, competencyName: "Mati", competencyDeletedAt: AT, requiredLevel: 4 },
        ],
        actuals: [
          { employeeId: 2, competencyId: 100, level: 1, assessedAt: AT },
          { employeeId: 1, competencyId: 101, level: 1, assessedAt: AT },
        ],
      }),
    )
    expect(q.rows.map((r) => r.employeeId)).toEqual([1])
    expect(q.rows[0]?.competencyName).toBe("Hidup")
    expect(q.summary.totalKaryawanPopulasi).toBe(3) // 1,5,6
    expect(q.summary.tanpaSyarat).toBe(2) // tanpa jabatan + jabatan tanpa syarat hidup
    expect(q.perCompetency.map((c) => c.name)).toEqual(["Hidup"])
    // Rekonsiliasi populasi: pasangan + tanpa-syarat karyawan konsisten
    expect(q.summary.totalPasangan).toBe(1)
  })

  it("AC-CGQ-B5: rekap pasangan + distinct per ember/kompetensi/jabatan dari populasi sama", () => {
    const q = buildCompetencyGapQueue(input())
    expect(q.perBucket["belum-dinilai"].pasangan).toBe(
      q.rows.filter((r) => r.bucket === "belum-dinilai").length,
    )
    expect(q.perBucket.memenuhi.pasangan).toBe(3)
    expect(q.summary.totalPasangan).toBe(
      q.summary.belumDinilai + q.summary.diBawahSyarat + q.summary.memenuhi,
    )
    const comp100 = q.perCompetency.find((c) => c.id === 100)
    expect(comp100).toMatchObject({
      belumDinilai: 1,
      diBawahSyarat: 2,
      memenuhi: 1,
      totalPasangan: 4,
    })
    expect(comp100?.karyawanDistinct).toBe(4)
    expect(q.perPosition[0]).toMatchObject({ id: 10, name: "Mekanik" })
    const serialized = JSON.stringify(q)
    for (const forbidden of [
      "assessedBy",
      "notes",
      "baseSalary",
      "salary",
      "payroll",
      "rank",
      "peringkat",
      "rataRata",
      "average",
      "persen",
      "percent",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })
})

describe("competency-gap-queue loader (AC-CGQ-B1/B4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: ["admin"] })
    mocks.getHrScope.mockResolvedValue({ kind: "all" })
    mocks.findEmployees.mockResolvedValue([
      { id: 1, name: "Karyawan 1", deletedAt: null, isActive: true, employmentEndedAt: null, positionId: 10, position: { name: "Mekanik" } },
      { id: 2, name: "Karyawan 2", deletedAt: null, isActive: true, employmentEndedAt: null, positionId: 10, position: { name: "Mekanik" } },
    ])
    mocks.findRequirements.mockResolvedValue([
      { positionId: 10, competencyId: 100, requiredLevel: 4, competency: { name: "Bongkar Mesin", deletedAt: null } },
    ])
    mocks.findActuals.mockResolvedValue([
      { employeeId: 2, competencyId: 100, level: 2, assessedAt: AT, competency: { deletedAt: null } },
    ])
  })

  it("fail-closed dua izin sebelum query; anti-N+1 tiga query massal; tanpa tulis", async () => {
    const q = await getCompetencyGapQueue()
    expect(mocks.requirePermission.mock.calls.map((c) => c[0])).toEqual([
      "view_competencies",
      "view_employees",
    ])
    expect(q.rows.map((r) => [r.employeeId, r.bucket])).toEqual([
      [1, "belum-dinilai"],
      [2, "di-bawah-syarat"],
    ])
    expect(q.rows[1]?.isCritical).toBe(true)
    expect(mocks.findEmployees).toHaveBeenCalledTimes(1)
    expect(mocks.findRequirements).toHaveBeenCalledTimes(1)
    expect(mocks.findActuals).toHaveBeenCalledTimes(1)
    expect(mocks.createCompetency).not.toHaveBeenCalled()
    expect(mocks.upsertActual).not.toHaveBeenCalled()

    expect(mocks.findEmployees.mock.calls[0]?.[0]?.where).toEqual({
      deletedAt: null,
      isActive: true,
      employmentEndedAt: null,
    })
    expect(mocks.findRequirements.mock.calls[0]?.[0]?.where).toEqual({
      positionId: { in: [10] },
      competency: { deletedAt: null },
    })
    expect(mocks.findActuals.mock.calls[0]?.[0]?.where).toEqual({
      employeeId: { in: [1, 2] },
      competency: { deletedAt: null },
    })
    const select = JSON.stringify({
      e: mocks.findEmployees.mock.calls[0]?.[0]?.select,
      r: mocks.findRequirements.mock.calls[0]?.[0]?.select,
      a: mocks.findActuals.mock.calls[0]?.[0]?.select,
    })
    for (const forbidden of ["assessedBy", "notes", "baseSalary", "salary"]) {
      expect(select).not.toContain(forbidden)
    }
  })

  it("tanpa view_employees: berhenti sebelum query apa pun", async () => {
    mocks.requirePermission
      .mockResolvedValueOnce({ id: "7", roles: ["admin"] })
      .mockRejectedValueOnce(new Error("ditolak employees"))
    await expect(getCompetencyGapQueue()).rejects.toThrow("ditolak employees")
    expect(mocks.findEmployees).not.toHaveBeenCalled()
    expect(mocks.findRequirements).not.toHaveBeenCalled()
  })

  it("tanpa view_competencies: berhenti sebelum izin kedua/query", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("ditolak"))
    await expect(getCompetencyGapQueue()).rejects.toThrow("ditolak")
    expect(mocks.requirePermission).toHaveBeenCalledTimes(1)
    expect(mocks.findEmployees).not.toHaveBeenCalled()
  })

  it("scope self/department/rusak diteruskan ke where karyawan; -1 nol baris tanpa query turunan", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 2 })
    await getCompetencyGapQueue()
    expect(mocks.findEmployees.mock.calls[0]?.[0]?.where).toEqual({
      deletedAt: null,
      isActive: true,
      employmentEndedAt: null,
      id: 2,
    })

    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: [] })
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: -1 })
    mocks.findEmployees.mockResolvedValue([])
    const empty = await getCompetencyGapQueue()
    expect(empty.rows).toEqual([])
    expect(empty.summary.totalKaryawanPopulasi).toBe(0)
    expect(mocks.findEmployees.mock.calls[0]?.[0]?.where).toEqual({
      deletedAt: null,
      isActive: true,
      employmentEndedAt: null,
      id: -1,
    })
    expect(mocks.findRequirements).not.toHaveBeenCalled()
    expect(mocks.findActuals).not.toHaveBeenCalled()

    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: ["kepala_bengkel"] })
    mocks.getHrScope.mockResolvedValue({
      kind: "department",
      departmentId: 3,
      employeeId: 9,
    })
    mocks.findEmployees.mockResolvedValue([])
    await getCompetencyGapQueue()
    expect(mocks.findEmployees.mock.calls[0]?.[0]?.where).toEqual({
      deletedAt: null,
      isActive: true,
      employmentEndedAt: null,
      departmentId: 3,
    })
  })
})
