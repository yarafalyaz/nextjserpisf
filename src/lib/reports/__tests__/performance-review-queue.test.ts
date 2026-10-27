import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  PERFORMANCE_QUEUE_COLUMN_LABELS,
  PERFORMANCE_QUEUE_EMPTY_TEXT,
  PERFORMANCE_QUEUE_LEVEL_LABELS,
  PERFORMANCE_QUEUE_NO_GOAL_LABEL,
  PERFORMANCE_QUEUE_NOTICE_TEXT,
  PERFORMANCE_QUEUE_STAGE_LABELS,
  PERFORMANCE_QUEUE_STALE_DAYS,
  buildPerformanceQueue,
  goalPairKey,
  type PerformanceQueueInput,
} from "../performance-review-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getHrScope: vi.fn(),
  findCycles: vi.fn(),
  findEmployees: vi.fn(),
  findReviews: vi.fn(),
  groupGoals: vi.fn(),
  createReview: vi.fn(),
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
    performanceCycle: { findMany: (...a: unknown[]) => mocks.findCycles(...a) },
    employee: { findMany: (...a: unknown[]) => mocks.findEmployees(...a) },
    performanceReview: {
      findMany: (...a: unknown[]) => mocks.findReviews(...a),
      create: (...a: unknown[]) => mocks.createReview(...a),
    },
    performanceGoal: { groupBy: (...a: unknown[]) => mocks.groupGoals(...a) },
  },
}))

import { getPerformanceQueue } from "../performance-review-queue-data"

// Hari kalender WIB tetap: NOW = 2026-10-27 WIB.
const NOW = new Date("2026-10-26T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function emp(employeeId: number, over: Partial<PerformanceQueueInput["employees"][number]> = {}) {
  return {
    employeeId,
    employeeName: `Karyawan ${employeeId}`,
    employeeDeletedAt: null,
    employeeIsActive: true,
    ...over,
  }
}

function input(over: Partial<PerformanceQueueInput> = {}): PerformanceQueueInput {
  return {
    cycle: {
      cycleId: 10,
      cycleSlug: "siklus-oktober",
      cycleName: "Siklus Oktober",
      cycleStatus: "active",
      cycleDeletedAt: null,
      periodStart: day(-30),
      periodEnd: day(-10),
    },
    employees: [emp(1), emp(2), emp(3), emp(4)],
    reviews: [
      { reviewId: 101, cycleId: 10, employeeId: 2, status: "draft", selfScore: null, managerScore: null, updatedAt: day(-2) },
      { reviewId: 102, cycleId: 10, employeeId: 3, status: "self_submitted", selfScore: "80.00", managerScore: null, updatedAt: day(-5) },
      { reviewId: 103, cycleId: 10, employeeId: 4, status: "manager_reviewed", selfScore: "70.00", managerScore: "75.50", updatedAt: day(-3) },
    ],
    goalPairs: [goalPairKey(10, 2), goalPairKey(10, 3), goalPairKey(10, 4)],
    ...over,
  }
}

describe("performance-review-queue builder (F-2026-10-27-077-S, Q-PFQ-1..8)", () => {
  it("kata tampil + notice verbatim spec §1 (Q-PFQ-2)", () => {
    expect(PERFORMANCE_QUEUE_COLUMN_LABELS).toEqual({
      karyawan: "Karyawan",
      siklus: "Siklus",
      tahap: "Tahap",
      skorDiri: "Skor Diri",
      skorAtasan: "Skor Atasan",
      periodeBerakhir: "Periode Berakhir",
      menunggu: "Menunggu",
    })
    expect(PERFORMANCE_QUEUE_STAGE_LABELS).toEqual({
      "menunggu-finalisasi": "Menunggu Finalisasi",
      "menunggu-atasan": "Menunggu Atasan",
      "belum-nilai-diri": "Belum Nilai Diri",
      "belum-ada-ulasan": "Belum Ada Ulasan",
    })
    expect(PERFORMANCE_QUEUE_LEVEL_LABELS).toEqual({ mengendap: "Mengendap", menunggu: "Menunggu" })
    expect(PERFORMANCE_QUEUE_NOTICE_TEXT).toBe(
      "Daftar ini hanya penilaian kinerja yang belum selesai pada siklus aktif. Penilaian dan finalisasi tetap dilakukan dari detail siklus; daftar ini tidak memberi peringkat antar karyawan.",
    )
    expect(PERFORMANCE_QUEUE_EMPTY_TEXT).toBe("Tidak ada penilaian kinerja yang belum selesai.")
    expect(PERFORMANCE_QUEUE_NO_GOAL_LABEL).toBe("Tanpa Sasaran")
    expect(PERFORMANCE_QUEUE_STALE_DAYS).toBe(7)
  })

  it("AC-PFQ-B1: populasi siklus active × karyawan aktif; finalized/status liar/siklus draft/nonaktif keluar baris+rekap", () => {
    const queue = buildPerformanceQueue(
      [
        input(),
        input({
          cycle: {
            cycleId: 11, cycleSlug: "draft", cycleName: "Siklus Draft", cycleStatus: "draft",
            cycleDeletedAt: null, periodStart: day(-30), periodEnd: day(-10),
          },
          reviews: [],
        }),
        input({
          cycle: {
            cycleId: 12, cycleSlug: "hapus", cycleName: "Siklus Terhapus", cycleStatus: "active",
            cycleDeletedAt: day(-1), periodStart: day(-30), periodEnd: day(-10),
          },
          reviews: [],
        }),
      ],
      { now: NOW },
    )
    expect(queue.rows.map((r) => r.cycleId)).toEqual([10, 10, 10, 10])
    expect(queue.cycles.map((c) => c.cycleId)).toEqual([10])
    expect(queue.summary).toEqual({ mengendap: 2, menunggu: 2, totalBelumSelesai: 4 })

    const filtered = buildPerformanceQueue(
      [
        input({
          employees: [
            emp(1),
            emp(2, { employeeIsActive: false }),
            emp(3, { employeeDeletedAt: day(-1) }),
            emp(4),
          ],
          reviews: [
            { reviewId: 101, cycleId: 10, employeeId: 1, status: "finalized", selfScore: "90.00", managerScore: "88.00", updatedAt: day(-1) },
            { reviewId: 102, cycleId: 10, employeeId: 4, status: "status-liar", selfScore: null, managerScore: null, updatedAt: day(-1) },
          ],
        }),
      ],
      { now: NOW },
    )
    expect(filtered.rows).toEqual([])
    expect(filtered.summary.totalBelumSelesai).toBe(0)
    expect(filtered.cycles[0]?.totalBelumSelesai).toBe(0)
  })

  it("AC-PFQ-B3/Q-PFQ-1: mengendap hanya periodEnd lewat DAN umur >= 7; acuan ganda; tanpa negatif; EC-PFQ-8 hari persis", () => {
    // periodEnd belum lewat: umur besar dari periodStart tetap menunggu.
    const belumLewat = buildPerformanceQueue(
      [input({ cycle: { cycleId: 10, cycleSlug: "s", cycleName: "S", cycleStatus: "active", cycleDeletedAt: null, periodStart: day(-30), periodEnd: day(5) } })],
      { now: NOW },
    )
    expect(belumLewat.rows.every((r) => r.level === "menunggu" && !r.lewatiAkhirPeriode)).toBe(true)

    // periodEnd hari ini persis: belum lewatiAkhirPeriode (EC-PFQ-8).
    const hariIni = buildPerformanceQueue(
      [input({ cycle: { cycleId: 10, cycleSlug: "s", cycleName: "S", cycleStatus: "active", cycleDeletedAt: null, periodStart: day(-30), periodEnd: day(0) } })],
      { now: NOW },
    )
    expect(hariIni.rows.every((r) => !r.lewatiAkhirPeriode && r.level === "menunggu")).toBe(true)

    // Lewat periodEnd tetapi umur tahap < 7 (updatedAt -3): menunggu.
    // Baris tanpa-review memakai periodStart (-30) → mengendap.
    const queue = buildPerformanceQueue([input()], { now: NOW })
    const byEmp = new Map(queue.rows.map((r) => [r.employeeId, r]))
    expect(byEmp.get(1)?.umurMenungguHari).toBe(30) // periodStart
    expect(byEmp.get(1)?.level).toBe("mengendap")
    expect(byEmp.get(2)?.umurMenungguHari).toBe(30) // draft → periodStart, bukan updatedAt -2
    expect(byEmp.get(2)?.level).toBe("mengendap")
    expect(byEmp.get(3)?.umurMenungguHari).toBe(5) // self_submitted → updatedAt
    expect(byEmp.get(3)?.level).toBe("menunggu")
    expect(byEmp.get(4)?.umurMenungguHari).toBe(3) // manager_reviewed → updatedAt
    expect(byEmp.get(4)?.level).toBe("menunggu")

    // updatedAt masa depan: umur 0, bukan negatif.
    const future = buildPerformanceQueue(
      [input({ reviews: [{ reviewId: 1, cycleId: 10, employeeId: 1, status: "self_submitted", selfScore: null, managerScore: null, updatedAt: day(4) }], employees: [emp(1)] })],
      { now: NOW },
    )
    expect(future.rows[0]?.umurMenungguHari).toBe(0)
  })

  it("Q-PFQ-3: urutan mengendap → finalisasi → atasan → nilai-diri → ulasan; tertua dalam ember; seri id karyawan naik", () => {
    const queue = buildPerformanceQueue([input()], { now: NOW })
    expect(queue.rows.map((r) => [r.employeeId, r.stageBucket, r.level])).toEqual([
      [2, "belum-nilai-diri", "mengendap"],
      [1, "belum-ada-ulasan", "mengendap"],
      [4, "menunggu-finalisasi", "menunggu"],
      [3, "menunggu-atasan", "menunggu"],
    ])

    // Seri umur+ember sama: id karyawan naik (input sengaja terbalik).
    const seri = buildPerformanceQueue(
      [input({
        cycle: { cycleId: 10, cycleSlug: "s", cycleName: "S", cycleStatus: "active", cycleDeletedAt: null, periodStart: day(-30), periodEnd: day(10) },
        employees: [emp(9), emp(5)],
        reviews: [],
      })],
      { now: NOW },
    )
    expect(seri.rows.map((r) => r.employeeId)).toEqual([5, 9])
  })

  it("AC-PFQ-B5: skor verbatim, tanpa kunci turunan/gaji/penilai; tanpaSasaran hanya ketiadaan goal", () => {
    const queue = buildPerformanceQueue([input()], { now: NOW })
    const byEmp = new Map(queue.rows.map((r) => [r.employeeId, r]))
    expect(byEmp.get(3)?.selfScore).toBe("80.00")
    expect(byEmp.get(3)?.managerScore).toBeNull()
    expect(byEmp.get(4)?.managerScore).toBe("75.50")
    // Karyawan 1 tanpa goal; 2..4 punya goal (goal tak ber-skor tetap BUKAN tanpaSasaran).
    expect(byEmp.get(1)?.tanpaSasaran).toBe(true)
    expect(byEmp.get(2)?.tanpaSasaran).toBe(false)
    expect(byEmp.get(3)?.tanpaSasaran).toBe(false)

    const serialized = JSON.stringify(queue.rows)
    for (const forbidden of ["finalScore", "baseSalary", "salary", "payroll", "reviewer", "rank", "peringkat", "rataRata", "averageScore", "weightedScore"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
    // Rekap per ember per siklus dari baris tampil.
    expect(queue.cycles[0]?.perStage).toEqual({
      "menunggu-finalisasi": 1,
      "menunggu-atasan": 1,
      "belum-nilai-diri": 1,
      "belum-ada-ulasan": 1,
    })

    // EC-PFQ-3: draft dengan skor parsial tetap belum-nilai-diri, skor verbatim.
    const parsial = buildPerformanceQueue(
      [input({ employees: [emp(1)], reviews: [{ reviewId: 1, cycleId: 10, employeeId: 1, status: "draft", selfScore: "55.00", managerScore: null, updatedAt: day(-1) }] })],
      { now: NOW },
    )
    expect(parsial.rows[0]?.stageBucket).toBe("belum-nilai-diri")
    expect(parsial.rows[0]?.selfScore).toBe("55.00")
  })
})

describe("performance-review-queue loader (AC-PFQ-B2/B4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: ["admin"] })
    mocks.getHrScope.mockResolvedValue({ kind: "all" })
    mocks.findCycles.mockResolvedValue([
      { id: 10, slug: "siklus-oktober", name: "Siklus Oktober", status: "active", periodStart: day(-30), periodEnd: day(-10), deletedAt: null },
    ])
    mocks.findEmployees.mockResolvedValue([
      { id: 1, name: "Karyawan 1", deletedAt: null, isActive: true },
      { id: 2, name: "Karyawan 2", deletedAt: null, isActive: true },
    ])
    mocks.findReviews.mockResolvedValue([
      { id: 101, cycleId: 10, employeeId: 2, status: "draft", selfScore: null, managerScore: null, updatedAt: day(-2) },
    ])
    mocks.groupGoals.mockResolvedValue([{ cycleId: 10, employeeId: 2 }])
  })

  it("fail-closed izin sebelum query; scope all; anti-N+1 empat query massal; tanpa create review", async () => {
    const queue = await getPerformanceQueue({ now: NOW })
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_performance")
    expect(queue.rows).toHaveLength(2)
    expect(queue.rows.map((r) => r.employeeId).sort()).toEqual([1, 2])
    expect(mocks.findCycles).toHaveBeenCalledTimes(1)
    expect(mocks.findEmployees).toHaveBeenCalledTimes(1)
    expect(mocks.findReviews).toHaveBeenCalledTimes(1)
    expect(mocks.groupGoals).toHaveBeenCalledTimes(1)
    expect(mocks.createReview).not.toHaveBeenCalled()

    expect(mocks.findCycles.mock.calls[0]?.[0]?.where).toEqual({ status: "active", deletedAt: null })
    expect(mocks.findEmployees.mock.calls[0]?.[0]?.where).toEqual({ deletedAt: null, isActive: true })
    expect(mocks.findReviews.mock.calls[0]?.[0]?.where).toEqual({
      cycleId: { in: [10] },
      employeeId: { in: [1, 2] },
      status: { in: ["draft", "self_submitted", "manager_reviewed"] },
    })
    const select = JSON.stringify(mocks.findReviews.mock.calls[0]?.[0]?.select ?? {})
    expect(select).not.toContain("finalScore")
    expect(select).not.toContain("reviewerEmployeeId")
  })

  it("tanpa izin: loader berhenti sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("ditolak"))
    await expect(getPerformanceQueue({ now: NOW })).rejects.toThrow("ditolak")
    expect(mocks.findCycles).not.toHaveBeenCalled()
    expect(mocks.findEmployees).not.toHaveBeenCalled()
    expect(mocks.findReviews).not.toHaveBeenCalled()
  })

  it("scope self hanya baris sendiri; scope rusak -1 nol baris; scope department hanya departemennya", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 2 })
    await getPerformanceQueue({ now: NOW })
    expect(mocks.findEmployees.mock.calls[0]?.[0]?.where).toEqual({
      deletedAt: null, isActive: true, id: 2,
    })

    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: [] })
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: -1 })
    mocks.findCycles.mockResolvedValue([
      { id: 10, slug: "s", name: "S", status: "active", periodStart: day(-30), periodEnd: day(-10), deletedAt: null },
    ])
    mocks.findEmployees.mockResolvedValue([])
    const empty = await getPerformanceQueue({ now: NOW })
    expect(empty.rows).toEqual([])
    expect(mocks.findEmployees.mock.calls[0]?.[0]?.where).toEqual({
      deletedAt: null, isActive: true, id: -1,
    })
    expect(mocks.findReviews).not.toHaveBeenCalled()

    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: ["kepala_bengkel"] })
    mocks.getHrScope.mockResolvedValue({ kind: "department", departmentId: 3, employeeId: 9 })
    mocks.findCycles.mockResolvedValue([])
    mocks.findEmployees.mockResolvedValue([])
    await getPerformanceQueue({ now: NOW })
    expect(mocks.findEmployees.mock.calls[0]?.[0]?.where).toEqual({
      deletedAt: null, isActive: true, departmentId: 3,
    })
  })

  it("Decimal skor verbatim ke string tanpa hitung ulang", async () => {
    mocks.findReviews.mockResolvedValue([
      { id: 101, cycleId: 10, employeeId: 2, status: "manager_reviewed", selfScore: { toString: () => "70.00" }, managerScore: { toString: () => "75.50" }, updatedAt: day(-3) },
    ])
    const queue = await getPerformanceQueue({ now: NOW })
    const row = queue.rows.find((r) => r.employeeId === 2)
    expect(row?.selfScore).toBe("70.00")
    expect(row?.managerScore).toBe("75.50")
    expect(row).not.toHaveProperty("finalScore")
  })
})
