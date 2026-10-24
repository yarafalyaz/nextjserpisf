/**
 * Builder murni papan beban rencana per stasiun kerja
 * (F-2026-10-22-090-S, putusan BOT 1 §9A Q-LP-1..4).
 *
 * - Beban Rencana = Σ estimatedHours tahap pending/in_progress pada WO aktif
 *   (himpunan ACTIVE_WORK_ORDER_STATUSES antrean existing). ProductionCost
 *   aktual TIDAK dicampur — aktual milik work-order-load existing (BR-LP-01/08).
 * - Tahap tanpa estimatedHours dihitung terpisah sebagai jumlah tahap, bukan
 *   0 jam karangan (BR-LP-02). Tahap tanpa workCenterId masuk ember
 *   "Belum ada stasiun"; nama teks tahap tidak pernah ditebak jadi stasiun
 *   (BR-LP-03).
 * - Semua tahap aktif masuk minggu berjalan (BR-LP-09 / Q-LP-4: tanpa kolom
 *   tanggal rencana); papan menampilkan minggu berjalan + 3 minggu ke depan,
 *   minggu sesudahnya beban 0 dengan kapasitas jadwal yang sama.
 * - Kapasitas per stasiun per minggu (Q-LP-3, fisik BOT 3):
 *   capacityHoursPerDay x parallelStations x hariKerjaEfektif. Hari kerja
 *   efektif stasiun = gabungan (union) tanggal dalam minggu itu yang menjadi
 *   hari kerja menurut jadwal efektif tahap-tahap penyusun beban stasiun,
 *   sesudah dikurangi Holiday nasional (semua) dan DepartmentHoliday
 *   (hanya departemen jadwal efektif tahap itu). Jadwal efektif per tahap
 *   diresolusi loader mengikuti rantai daily-attendance.service.ts
 *   (karyawan -> departemen karyawan -> perusahaan tak-terikat; isActive,
 *   id asc, pertama; workDays CSV 0..6, kosong/tidak valid = Senin–Jumat).
 *   Tanpa satu pun tahap penyusun yang punya jadwal efektif: kapasitas null
 *   dan persen null — tampil "—", bukan persen karangan (BR-LP-04, AC-LP-5).
 * - Ember "Belum ada stasiun" tidak punya master: kapasitas/persen selalu null.
 * - Papan read-model turunan: nol kolom tersimpan, nol jurnal, nol StockMove
 *   (BR-LP-08). Persen > 100 hanya penanda teks, tidak memblokir apa pun
 *   (BR-LP-05).
 *
 * Pure (tanpa Prisma/DOM); loader massalnya ada di
 * `work-center-load-plan-data.ts`.
 */

import { ACTIVE_WORK_ORDER_STATUSES } from "@/lib/reports/work-order-queue"

export const LOAD_PLAN_TITLE = "Beban Rencana Stasiun Kerja"
export const LOAD_PLAN_UNASSIGNED_LABEL = "Belum ada stasiun"
export const LOAD_PLAN_OVER_CAPACITY_LABEL = "Melebihi kapasitas"
export const LOAD_PLAN_DRILL_TITLE = "Rincian Tahap Penyusun Beban"
export const LOAD_PLAN_NOTICE =
  "Beban rencana dihitung dari estimasi jam tahap yang belum selesai. Ini rencana kasar untuk melihat kepadatan stasiun, bukan jadwal pasti dan tidak mengunci tanggal selesai."
/** Status tahap yang menyusun beban rencana (BR-LP-01). */
export const LOAD_PLAN_OPERATION_STATUSES = ["pending", "in_progress"] as const
/** Minggu berjalan + 3 minggu ke depan (BR-LP-09). */
export const LOAD_PLAN_WEEK_COUNT = 4

export interface WorkCenterLoadPlanCenterInput {
  id: number
  name: string
  capacityHoursPerDay: number
  parallelStations: number
  isActive: boolean
  sortOrder: number
}

export interface WorkCenterLoadPlanScheduleInput {
  /** CSV angka hari pola daily-attendance (0=Minggu..6=Sabtu); kosong = Senin–Jumat. */
  workDays: string
  /** Departemen jadwal efektif tahap (untuk DepartmentHoliday); null bila tak terikat. */
  departmentId: number | null
}

export interface WorkCenterLoadPlanOperationInput {
  id: number
  workOrderId: number
  workOrderDocumentNo: string
  workOrderSlug: string | null
  workOrderStatus: string
  workOrderEndDate: Date | null
  customerName: string | null
  vehicleLabel: string | null
  name: string
  status: string
  estimatedHours: number | null
  workCenterId: number | null
  assignedEmployeeId: number | null
  assignedEmployeeName: string | null
  /** Jadwal efektif tahap hasil resolusi loader; null = tidak ada rujukan jadwal. */
  effectiveSchedule: WorkCenterLoadPlanScheduleInput | null
}

export interface WorkCenterLoadPlanDrillRow {
  operationId: number
  workOrderId: number
  workOrderDocumentNo: string
  workOrderSlug: string | null
  customerName: string | null
  vehicleLabel: string | null
  operationName: string
  status: string
  estimatedHours: number | null
  assignedEmployeeId: number | null
  assignedEmployeeName: string | null
  workOrderEndDate: Date | null
  /** endDate ada dan hari kalendernya sebelum hari ini (pola antrean WO). */
  isOverdue: boolean
}

export interface WorkCenterLoadPlanWeekRow {
  workCenterId: number | null
  namaStasiun: string
  /** Ember "Belum ada stasiun" (workCenterId null), bukan master stasiun. */
  isUnassignedBucket: boolean
  /** Master nonaktif tetap tampil supaya tahap historis terbaca (BR-LP-06). */
  isActive: boolean
  weekIndex: number
  /** Senin minggu ini (awal hari lokal). */
  weekStart: Date
  /** Minggu minggu ini (akhir hari lokal, inklusif untuk tampil). */
  weekEnd: Date
  bebanJam: number
  tahapTanpaEstimasi: number
  /** Jumlah hari kerja efektif hasil union jadwal tahap penyusun; null tanpa dasar. */
  hariKerjaEfektif: number | null
  kapasitasJam: number | null
  persenBeban: number | null
  /** Teks "Melebihi kapasitas" bila persenBeban > 100, selain itu null (BR-LP-05). */
  keterangan: string | null
  tahapan: WorkCenterLoadPlanDrillRow[]
}

export interface WorkCenterLoadPlan {
  title: string
  notice: string
  drillTitle: string
  /** Senin minggu berjalan (awal hari lokal). */
  currentWeekStart: Date
  rows: WorkCenterLoadPlanWeekRow[]
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

const MS_PER_DAY = 86_400_000

function calendarDay(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY,
  )
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Senin awal hari lokal untuk minggu yang memuat `date`. */
export function mondayOfWeek(date: Date): Date {
  const day = startOfDay(date)
  const offset = (day.getDay() + 6) % 7
  day.setDate(day.getDate() - offset)
  return day
}

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

/** Parse workDays pola daily-attendance.service.ts:48-50; token kosong dibuang
 * dulu (Number("") === 0 akan mengarang hari Minggu) — Q-LP-3: kosong = Senin–Jumat. */
export function parseWorkDays(raw: string): number[] {
  const days = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
  const effective = days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  return effective.length ? effective : [1, 2, 3, 4, 5]
}

/**
 * Nama stasiun ternormalisasi (Q-LP-5 fisik BOT 3): trim + lowercase.
 * Keunikan hanya di antara stasiun aktif — ditegakkan aksi server memakai
 * daftar existing ini; nama sama dengan stasiun nonaktif boleh (AC-LP-8).
 */
export function normalizeWorkCenterName(name: string): string {
  return name.trim().toLowerCase()
}

export function evaluateWorkCenterNameAvailability(input: {
  existing: ReadonlyArray<{ id: number; normalizedName: string; isActive: boolean }>
  name: string
  excludeId?: number | null
}): { ok: true; normalizedName: string } | { ok: false; error: string } {
  const normalizedName = normalizeWorkCenterName(input.name)
  if (!normalizedName) return { ok: false, error: "Nama stasiun wajib diisi" }
  const dup = input.existing.some(
    (center) =>
      center.isActive &&
      center.normalizedName === normalizedName &&
      center.id !== (input.excludeId ?? -1),
  )
  if (dup) return { ok: false, error: "Nama stasiun aktif sudah digunakan" }
  return { ok: true, normalizedName }
}

/** Tanggal-tanggal kerja satu jadwal efektif dalam minggu [weekStart, weekStart+7). */
function scheduleWorkDates(
  schedule: WorkCenterLoadPlanScheduleInput,
  weekStart: Date,
  nationalHolidays: ReadonlySet<string>,
  departmentHolidays: ReadonlySet<string>,
): Set<string> {
  const workDays = parseWorkDays(schedule.workDays)
  const dates = new Set<string>()
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + i)
    if (!workDays.includes(date.getDay())) continue
    const key = dateKey(date)
    if (nationalHolidays.has(key)) continue
    if (
      schedule.departmentId != null &&
      departmentHolidays.has(`${schedule.departmentId}:${key}`)
    ) {
      continue
    }
    dates.add(key)
  }
  return dates
}

export function buildWorkCenterLoadPlan(input: {
  centers: readonly WorkCenterLoadPlanCenterInput[]
  operations: readonly WorkCenterLoadPlanOperationInput[]
  /** Tanggal libur nasional (Date apa pun pada hari kalendernya). */
  holidays: readonly Date[]
  departmentHolidays: readonly { departmentId: number; date: Date }[]
  now?: Date
}): WorkCenterLoadPlan {
  const now = input.now ?? new Date()
  const currentWeekStart = mondayOfWeek(now)
  const today = calendarDay(now)
  const nationalHolidays = new Set(input.holidays.map((d) => dateKey(d)))
  const departmentHolidays = new Set(
    input.departmentHolidays.map((h) => `${h.departmentId}:${dateKey(h.date)}`),
  )

  const contributing = input.operations.filter(
    (op) =>
      (ACTIVE_WORK_ORDER_STATUSES as readonly string[]).includes(op.workOrderStatus) &&
      (LOAD_PLAN_OPERATION_STATUSES as readonly string[]).includes(op.status),
  )

  const centersById = new Map(input.centers.map((c) => [c.id, c]))
  const sortedCenters = [...input.centers].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  )

  const opsByCenter = new Map<number | null, WorkCenterLoadPlanOperationInput[]>()
  for (const op of contributing) {
    // workCenterId yatim (master tidak dikirim loader) tidak ditebak: ember.
    const key = op.workCenterId != null && centersById.has(op.workCenterId) ? op.workCenterId : null
    const list = opsByCenter.get(key) ?? []
    list.push(op)
    opsByCenter.set(key, list)
  }

  const rows: WorkCenterLoadPlanWeekRow[] = []
  const pushStationRows = (
    center: WorkCenterLoadPlanCenterInput | null,
    ops: WorkCenterLoadPlanOperationInput[],
  ) => {
    const drill: WorkCenterLoadPlanDrillRow[] = [...ops]
      .sort(
        (a, b) =>
          a.workOrderDocumentNo.localeCompare(b.workOrderDocumentNo) ||
          a.workOrderId - b.workOrderId ||
          a.id - b.id,
      )
      .map((op) => ({
        operationId: op.id,
        workOrderId: op.workOrderId,
        workOrderDocumentNo: op.workOrderDocumentNo,
        workOrderSlug: op.workOrderSlug,
        customerName: op.customerName,
        vehicleLabel: op.vehicleLabel,
        operationName: op.name,
        status: op.status,
        estimatedHours: op.estimatedHours,
        assignedEmployeeId: op.assignedEmployeeId,
        assignedEmployeeName: op.assignedEmployeeName,
        workOrderEndDate: op.workOrderEndDate,
        isOverdue:
          op.workOrderEndDate != null && calendarDay(op.workOrderEndDate) < today,
      }))

    const bebanJam = round2(
      ops.reduce((sum, op) => sum + (op.estimatedHours ?? 0), 0),
    )
    const tahapTanpaEstimasi = ops.filter((op) => op.estimatedHours == null).length
    const schedules = ops
      .map((op) => op.effectiveSchedule)
      .filter((s): s is WorkCenterLoadPlanScheduleInput => s != null)

    for (let weekIndex = 0; weekIndex < LOAD_PLAN_WEEK_COUNT; weekIndex++) {
      const weekStart = new Date(currentWeekStart)
      weekStart.setDate(weekStart.getDate() + weekIndex * 7)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)

      const isCurrentWeek = weekIndex === 0
      const weekBeban = isCurrentWeek ? bebanJam : 0

      let hariKerjaEfektif: number | null = null
      let kapasitasJam: number | null = null
      if (center && schedules.length > 0) {
        const union = new Set<string>()
        for (const schedule of schedules) {
          for (const key of scheduleWorkDates(
            schedule,
            weekStart,
            nationalHolidays,
            departmentHolidays,
          )) {
            union.add(key)
          }
        }
        hariKerjaEfektif = union.size
        kapasitasJam = round2(
          center.capacityHoursPerDay * center.parallelStations * union.size,
        )
      }

      const persenBeban =
        kapasitasJam != null && kapasitasJam > 0
          ? round1((weekBeban / kapasitasJam) * 100)
          : null

      rows.push({
        workCenterId: center?.id ?? null,
        namaStasiun: center?.name ?? LOAD_PLAN_UNASSIGNED_LABEL,
        isUnassignedBucket: center == null,
        isActive: center?.isActive ?? false,
        weekIndex,
        weekStart,
        weekEnd,
        bebanJam: weekBeban,
        tahapTanpaEstimasi: isCurrentWeek ? tahapTanpaEstimasi : 0,
        hariKerjaEfektif,
        kapasitasJam,
        persenBeban,
        keterangan:
          persenBeban != null && persenBeban > 100
            ? LOAD_PLAN_OVER_CAPACITY_LABEL
            : null,
        tahapan: isCurrentWeek ? drill : [],
      })
    }
  }

  for (const center of sortedCenters) {
    pushStationRows(center, opsByCenter.get(center.id) ?? [])
  }
  // Ember selalu terakhir dan selalu tampil: tahap tanpa stasiun harus
  // terlihat walau kosong, supaya tidak hilang diam-diam (BR-LP-03).
  pushStationRows(null, opsByCenter.get(null) ?? [])

  return {
    title: LOAD_PLAN_TITLE,
    notice: LOAD_PLAN_NOTICE,
    drillTitle: LOAD_PLAN_DRILL_TITLE,
    currentWeekStart,
    rows,
  }
}
