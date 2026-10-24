import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Papan beban rencana stasiun kerja (F-2026-10-22-090-S, AC-LP-1..8,10,11).
 * Yang dijaga: beban hanya dari estimatedHours tahap pending/in_progress WO
 * aktif; tanpa estimasi terhitung terpisah bukan 0 jam; tanpa stasiun masuk
 * ember; kapasitas dari jadwal efektif (union per stasiun, libur mengurangi);
 * tanpa dasar jadwal kapasitas/persen null; drill rekonsiliasi ke beban.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    workCenter: { findMany: vi.fn() },
    workOrder: { findMany: vi.fn() },
    workSchedule: { findMany: vi.fn() },
    holiday: { findMany: vi.fn() },
    departmentHoliday: { findMany: vi.fn() },
    employee: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  buildWorkCenterLoadPlan,
  evaluateWorkCenterNameAvailability,
  LOAD_PLAN_NOTICE,
  mondayOfWeek,
  type WorkCenterLoadPlanCenterInput,
  type WorkCenterLoadPlanOperationInput,
} from "../work-center-load-plan"
import { getWorkCenterLoadPlan } from "../work-center-load-plan-data"

// Senin 2026-10-19 .. Minggu 2026-10-25 (WIB lokal).
const NOW = new Date(2026, 9, 21, 10, 0, 0) // Rabu 21 Okt 2026

function center(over: Partial<WorkCenterLoadPlanCenterInput>): WorkCenterLoadPlanCenterInput {
  return {
    id: 1,
    name: "Las",
    capacityHoursPerDay: 8,
    parallelStations: 1,
    isActive: true,
    sortOrder: 0,
    ...over,
  }
}

function op(over: Partial<WorkCenterLoadPlanOperationInput>): WorkCenterLoadPlanOperationInput {
  return {
    id: 1,
    workOrderId: 10,
    workOrderDocumentNo: "WO-10",
    workOrderSlug: null,
    workOrderStatus: "in_progress",
    workOrderEndDate: null,
    customerName: "Budi",
    vehicleLabel: null,
    name: "Las rangka",
    status: "pending",
    estimatedHours: 10,
    workCenterId: 1,
    assignedEmployeeId: 5,
    assignedEmployeeName: "Andi",
    effectiveSchedule: { workDays: "1,2,3,4,5", departmentId: 3 },
    ...over,
  }
}

function build(over: Partial<Parameters<typeof buildWorkCenterLoadPlan>[0]> = {}) {
  return buildWorkCenterLoadPlan({
    centers: [center({})],
    operations: [op({})],
    holidays: [],
    departmentHolidays: [],
    now: NOW,
    ...over,
  })
}

function currentRow(r: ReturnType<typeof build>, id: number | null) {
  return r.rows.find((row) => row.workCenterId === id && row.weekIndex === 0)
}

describe("buildWorkCenterLoadPlan", () => {
  it("AC-LP-1: dua WO aktif tahap Las 10 + 6 jam -> beban minggu berjalan 16 jam", () => {
    const r = build({
      operations: [
        op({ id: 1, estimatedHours: 10 }),
        op({ id: 2, workOrderId: 11, workOrderDocumentNo: "WO-11", estimatedHours: 6 }),
      ],
    })
    expect(currentRow(r, 1)).toMatchObject({ namaStasiun: "Las", bebanJam: 16 })
  })

  it("AC-LP-2: tahap tanpa estimasi tidak menambah jam, terhitung terpisah", () => {
    const r = build({
      operations: [op({ id: 1, estimatedHours: 10 }), op({ id: 2, estimatedHours: null })],
    })
    expect(currentRow(r, 1)).toMatchObject({ bebanJam: 10, tahapTanpaEstimasi: 1 })
  })

  it("AC-LP-3: tahap tanpa stasiun masuk ember walau nama tahap teksnya Las", () => {
    const r = build({ operations: [op({ workCenterId: null, name: "Las" })] })
    expect(currentRow(r, null)).toMatchObject({
      namaStasiun: "Belum ada stasiun",
      bebanJam: 10,
      isUnassignedBucket: true,
      kapasitasJam: null,
      persenBeban: null,
    })
    expect(currentRow(r, 1)).toMatchObject({ bebanJam: 0 })
  })

  it("AC-LP-4: tahap completed/skipped dan WO final keluar dari beban", () => {
    const r = build({
      operations: [
        op({ id: 1, estimatedHours: 10 }),
        op({ id: 2, status: "completed", estimatedHours: 100 }),
        op({ id: 3, status: "skipped", estimatedHours: 100 }),
        op({ id: 4, workOrderStatus: "completed", estimatedHours: 100 }),
        op({ id: 5, workOrderStatus: "cancelled", estimatedHours: 100 }),
      ],
    })
    expect(currentRow(r, 1)).toMatchObject({ bebanJam: 10 })
  })

  it("AC-LP-5: tanpa jadwal efektif kapasitas dan persen null, beban tetap tampil", () => {
    const r = build({ operations: [op({ effectiveSchedule: null, assignedEmployeeId: null })] })
    expect(currentRow(r, 1)).toMatchObject({
      bebanJam: 10,
      kapasitasJam: null,
      persenBeban: null,
      hariKerjaEfektif: null,
      keterangan: null,
    })
  })

  it("kapasitas = jam/hari x stasiun paralel x hari kerja efektif; libur nasional mengurangi", () => {
    // Senin–Jumat = 5 hari; libur nasional Rabu 21 Okt -> 4 hari. 8 x 2 x 4 = 64.
    const r = build({
      centers: [center({ parallelStations: 2 })],
      holidays: [new Date(2026, 9, 21)],
    })
    expect(currentRow(r, 1)).toMatchObject({
      hariKerjaEfektif: 4,
      kapasitasJam: 64,
      persenBeban: 15.6,
    })
  })

  it("DepartmentHoliday hanya mengurangi bila departemen jadwal efektif sama", () => {
    const deptHoliday = [{ departmentId: 3, date: new Date(2026, 9, 22) }]
    const cocok = build({ departmentHolidays: deptHoliday })
    expect(currentRow(cocok, 1)).toMatchObject({ hariKerjaEfektif: 4 })
    const beda = build({
      departmentHolidays: [{ departmentId: 9, date: new Date(2026, 9, 22) }],
    })
    expect(currentRow(beda, 1)).toMatchObject({ hariKerjaEfektif: 5 })
  })

  it("hari kerja stasiun = gabungan jadwal tahap penyusun (union, bukan irisan)", () => {
    const r = build({
      operations: [
        op({ id: 1, effectiveSchedule: { workDays: "1,3,5", departmentId: null } }),
        op({ id: 2, effectiveSchedule: { workDays: "2,4", departmentId: null } }),
      ],
    })
    expect(currentRow(r, 1)).toMatchObject({ hariKerjaEfektif: 5, kapasitasJam: 40 })
  })

  it("workDays kosong mengikuti pola existing: Senin-Jumat", () => {
    const r = build({
      operations: [op({ effectiveSchedule: { workDays: "", departmentId: null } })],
    })
    expect(currentRow(r, 1)).toMatchObject({ hariKerjaEfektif: 5 })
  })

  it("AC-LP-6: beban melebihi kapasitas -> penanda teks, persen tetap tampil", () => {
    const r = build({ operations: [op({ estimatedHours: 50 })] })
    expect(currentRow(r, 1)).toMatchObject({
      kapasitasJam: 40,
      persenBeban: 125,
      keterangan: "Melebihi kapasitas",
    })
  })

  it("AC-LP-11: jumlah jam baris drill = beban kartu stasiun", () => {
    const r = build({
      operations: [
        op({ id: 1, estimatedHours: 10 }),
        op({ id: 2, estimatedHours: 6.5 }),
        op({ id: 3, estimatedHours: null }),
      ],
    })
    const row = currentRow(r, 1)
    const drillSum = row?.tahapan.reduce((s, t) => s + (t.estimatedHours ?? 0), 0)
    expect(drillSum).toBe(row?.bebanJam)
    expect(row?.tahapan).toHaveLength(3)
  })

  it("minggu 1-3: beban 0, kapasitas jadwal tetap dihitung, drill kosong", () => {
    const r = build({})
    const week1 = r.rows.find((row) => row.workCenterId === 1 && row.weekIndex === 1)
    expect(week1).toMatchObject({ bebanJam: 0, kapasitasJam: 40, persenBeban: 0, tahapan: [] })
    expect(r.rows.filter((row) => row.workCenterId === 1)).toHaveLength(4)
  })

  it("label dan notice verbatim spec §6", () => {
    const r = build({})
    expect(r.title).toBe("Beban Rencana Stasiun Kerja")
    expect(r.drillTitle).toBe("Rincian Tahap Penyusun Beban")
    expect(r.notice).toBe(LOAD_PLAN_NOTICE)
    expect(r.notice).toContain("bukan jadwal pasti")
    expect(mondayOfWeek(NOW).getDay()).toBe(1)
  })

  it("stasiun nonaktif tetap tampil dengan nama dan bebannya (BR-LP-06)", () => {
    const r = build({ centers: [center({ isActive: false })] })
    expect(currentRow(r, 1)).toMatchObject({ namaStasiun: "Las", isActive: false, bebanJam: 10 })
  })
})

describe("evaluateWorkCenterNameAvailability (Q-LP-5/AC-LP-8)", () => {
  const existing = [
    { id: 1, normalizedName: "las", isActive: true },
    { id: 2, normalizedName: "potong", isActive: false },
  ]
  it("duplikat aktif ditolak walau beda kapital/spasi", () => {
    expect(evaluateWorkCenterNameAvailability({ existing, name: " LAS " }).ok).toBe(false)
  })
  it("nama sama dengan stasiun nonaktif boleh", () => {
    expect(evaluateWorkCenterNameAvailability({ existing, name: "Potong" }).ok).toBe(true)
  })
  it("stasiun mengecualikan dirinya saat ubah", () => {
    expect(
      evaluateWorkCenterNameAvailability({ existing, name: "Las", excludeId: 1 }).ok,
    ).toBe(true)
  })
})

describe("getWorkCenterLoadPlan (loader)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.workCenter.findMany.mockResolvedValue([
      { id: 1, name: "Las", capacityHoursPerDay: { toString: () => "8" }, parallelStations: 1, isActive: true, sortOrder: 0 },
    ])
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      {
        id: 10, slug: null, documentNo: "WO-10", status: "in_progress", endDate: null,
        customer: { name: "Budi" },
        customerVehicle: null,
        operations: [
          {
            id: 1, name: "Las rangka", status: "pending",
            estimatedHours: { toString: () => "10" }, workCenterId: 1,
            assignedEmployeeId: 5, assignedEmployee: { name: "Andi" },
          },
          {
            id: 2, name: "Las tambahan", status: "pending",
            estimatedHours: null, workCenterId: 1,
            assignedEmployeeId: null, assignedEmployee: null,
          },
        ],
      },
    ])
    mocks.prismaMock.workSchedule.findMany.mockResolvedValue([
      { id: 7, workDays: "1,2,3,4,5" },
    ])
    mocks.prismaMock.holiday.findMany.mockResolvedValue([])
    mocks.prismaMock.departmentHoliday.findMany.mockResolvedValue([])
    mocks.prismaMock.employee.findMany.mockResolvedValue([
      {
        id: 5, departmentId: 3, workSchedules: [],
        department: { id: 3, workSchedules: [{ id: 4, workDays: "1,2,3,4,5" }] },
      },
    ])
  })

  it("resolusi jadwal: karyawan tanpa jadwal -> departemen; beban dan kapasitas menyatu", async () => {
    const r = await getWorkCenterLoadPlan(NOW)
    const row = r.rows.find((x) => x.workCenterId === 1 && x.weekIndex === 0)
    expect(row).toMatchObject({ bebanJam: 10, tahapTanpaEstimasi: 1, kapasitasJam: 40 })
    expect(mocks.prismaMock.workOrder.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.employee.findMany).toHaveBeenCalledTimes(1)
  })

  it("tanpa jadwal perusahaan dan tanpa jadwal karyawan/departemen: kapasitas null", async () => {
    mocks.prismaMock.workSchedule.findMany.mockResolvedValue([])
    mocks.prismaMock.employee.findMany.mockResolvedValue([
      { id: 5, departmentId: 3, workSchedules: [], department: { id: 3, workSchedules: [] } },
    ])
    const r = await getWorkCenterLoadPlan(NOW)
    const row = r.rows.find((x) => x.workCenterId === 1 && x.weekIndex === 0)
    expect(row).toMatchObject({ bebanJam: 10, kapasitasJam: null, persenBeban: null })
  })
})
