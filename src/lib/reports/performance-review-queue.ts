/**
 * Builder murni antrean penilaian kinerja belum selesai per siklus aktif
 * (F-2026-10-27-077-S, PUTUSAN LEAD Q-PFQ-1..8 di backlog §8, 27 Okt 2026).
 *
 * Populasi: siklus `active` + `deletedAt: null` × karyawan `deletedAt: null`
 * + `isActive: true` (BR-PFQ-01/06, Q-PFQ-5); review `finalized` dan status
 * review liar di luar antrean. Ember tahap HANYA dari status review
 * tersimpan (BR-PFQ-03): tanpa baris review → `belum-ada-ulasan`, `draft` →
 * `belum-nilai-diri`, `self_submitted` → `menunggu-atasan`,
 * `manager_reviewed` → `menunggu-finalisasi`. Kode existing TIDAK memaksa
 * nilai-diri sebelum nilai-atasan — antrean menampilkan status apa adanya.
 *
 * Tingkat `mengendap` (Q-PFQ-1): hanya hidup sesudah `periodEnd` lewat DAN
 * umur menunggu >= PERFORMANCE_QUEUE_STALE_DAYS hari kalender WIB — angka
 * hanya hidup di satu konstanta itu. Acuan umur ganda DISAHKAN Q-PFQ-3:
 * tanpa-review/draft dari `periodStart` siklus, self_submitted/
 * manager_reviewed dari `updatedAt` review. `periodEnd` hari ini persis
 * (WIB) belum `lewatiAkhirPeriode` (EC-PFQ-8); umur tidak pernah negatif.
 *
 * Urutan Q-PFQ-3: `mengendap` dulu, lalu ember menunggu-finalisasi →
 * menunggu-atasan → belum-nilai-diri → belum-ada-ulasan; dalam ember umur
 * tertua dulu; seri → id karyawan naik; seri terakhir (dua siklus) → id
 * siklus naik. Penanda `tanpaSasaran` = ketiadaan PerformanceGoal
 * [cycleId, employeeId] — fakta pendamping polos, BUKAN ember/tingkat
 * (Q-PFQ-8); sasaran ada-tapi-semua-belum-ternilai BUKAN tanpa-sasaran.
 *
 * Baca-saja: builder tidak memanggil ensureReview, submit, atau finalize dan
 * tidak menciptakan baris review (BR-PFQ-02). Skor `selfScore`/
 * `managerScore` verbatim payload server — TANPA hitung ulang skor,
 * TANPA finalScore, TANPA ranking, TANPA data gaji, TANPA nama penilai/
 * penanggung jawab (BR-PFQ-04/08/09/10). Loader pembaca massal anti-N+1:
 * `performance-review-queue-data.ts` (`view_performance` + `getHrScope`
 * fail-closed sebelum query, Q-PFQ-7).
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/** Judul kolom verbatim spec §1 (Q-PFQ-2) — UI menempel apa adanya. */
export const PERFORMANCE_QUEUE_TITLE = "Antrean Penilaian Kinerja Belum Selesai"

export const PERFORMANCE_QUEUE_COLUMN_LABELS = {
  karyawan: "Karyawan",
  siklus: "Siklus",
  tahap: "Tahap",
  skorDiri: "Skor Diri",
  skorAtasan: "Skor Atasan",
  periodeBerakhir: "Periode Berakhir",
  menunggu: "Menunggu",
} as const

export const PERFORMANCE_QUEUE_STAGE_BUCKETS = [
  "menunggu-finalisasi",
  "menunggu-atasan",
  "belum-nilai-diri",
  "belum-ada-ulasan",
] as const

export type PerformanceQueueStageBucket =
  (typeof PERFORMANCE_QUEUE_STAGE_BUCKETS)[number]

export const PERFORMANCE_QUEUE_LEVELS = ["mengendap", "menunggu"] as const

export type PerformanceQueueLevel = (typeof PERFORMANCE_QUEUE_LEVELS)[number]

/** Label ember verbatim spec §1 (Q-PFQ-2) — UI menempel apa adanya. */
export const PERFORMANCE_QUEUE_STAGE_LABELS: Record<
  PerformanceQueueStageBucket,
  string
> = {
  "menunggu-finalisasi": "Menunggu Finalisasi",
  "menunggu-atasan": "Menunggu Atasan",
  "belum-nilai-diri": "Belum Nilai Diri",
  // Fakta baris (ketiadaan baris review), bukan tuduhan orang (Q-PFQ-2).
  "belum-ada-ulasan": "Belum Ada Ulasan",
}

/** Label tingkat verbatim keluarga antrean mengendap (Q-PFQ-1/2). */
export const PERFORMANCE_QUEUE_LEVEL_LABELS: Record<
  PerformanceQueueLevel,
  string
> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu",
}

/** Notice verbatim spec §1 (Q-PFQ-2) — UI menempel apa adanya. */
export const PERFORMANCE_QUEUE_NOTICE_TEXT =
  "Daftar ini hanya penilaian kinerja yang belum selesai pada siklus aktif. Penilaian dan finalisasi tetap dilakukan dari detail siklus; daftar ini tidak memberi peringkat antar karyawan."

export const PERFORMANCE_QUEUE_EMPTY_TEXT =
  "Tidak ada penilaian kinerja yang belum selesai."

/** Tanda skor kosong di UI (spec §3: null → `—`). */
export const PERFORMANCE_QUEUE_NO_SCORE_LABEL = "—"

/**
 * Ambang mengendap Q-PFQ-1: satu-satunya tempat angka 7 hidup.
 * Mengendap mensyaratkan periodEnd sudah lewat DAN umur >= angka ini.
 */
export const PERFORMANCE_QUEUE_STALE_DAYS = 7

const MS_PER_DAY = 86_400_000

/** Skor Decimal(5,2) existing dibawa sebagai string agar nilai verbatim. */
export interface PerformanceQueueCycleInput {
  cycleId: number
  /** Slug siklus untuk tautan detail; null bila belum terisi. */
  cycleSlug: string | null
  cycleName: string
  /** Status siklus apa adanya; hanya `active` populasi (BR-PFQ-01). */
  cycleStatus: string
  cycleDeletedAt: Date | null
  periodStart: Date
  periodEnd: Date
}

export interface PerformanceQueueEmployeeInput {
  employeeId: number
  employeeName: string
  employeeDeletedAt: Date | null
  employeeIsActive: boolean
}

export interface PerformanceQueueReviewInput {
  reviewId: number
  cycleId: number
  employeeId: number
  /** Status review tersimpan apa adanya (BR-PFQ-03). */
  status: string
  selfScore: string | null
  managerScore: string | null
  updatedAt: Date
}

export interface PerformanceQueueInput {
  cycle: PerformanceQueueCycleInput
  employees: readonly PerformanceQueueEmployeeInput[]
  reviews: readonly PerformanceQueueReviewInput[]
  /** Pasangan [cycleId, employeeId] yang MEMILIKI >= 1 PerformanceGoal. */
  goalPairs: readonly string[]
}

export interface PerformanceQueueRow {
  cycleId: number
  cycleSlug: string | null
  cycleName: string
  periodEnd: Date
  employeeId: number
  employeeName: string
  stageBucket: PerformanceQueueStageBucket
  stageLabel: string
  level: PerformanceQueueLevel
  levelLabel: string
  /** Hari kalender WIB sejak acuan tahap (§3/Q-PFQ-3); tidak pernah negatif. */
  umurMenungguHari: number
  /** Hari ini (WIB) sesudah periodEnd siklus dan review belum finalized. */
  lewatiAkhirPeriode: boolean
  /** Tidak ada satu pun PerformanceGoal [cycleId, employeeId] (Q-PFQ-8). */
  tanpaSasaran: boolean
  /** Skor verbatim payload server; null = belum ada (UI tampil `—`). */
  selfScore: string | null
  managerScore: string | null
}

export interface PerformanceQueueCycleSummary {
  cycleId: number
  cycleName: string
  mengendap: number
  menunggu: number
  perStage: Record<PerformanceQueueStageBucket, number>
  totalBelumSelesai: number
}

export interface PerformanceQueue {
  rows: PerformanceQueueRow[]
  /** Rekap hitungan baris tampil per ember per siklus (AC-PFQ-B4). */
  cycles: PerformanceQueueCycleSummary[]
  summary: {
    mengendap: number
    menunggu: number
    totalBelumSelesai: number
  }
  staleDays: number
}

export interface PerformanceQueueOptions {
  now?: Date
}

/** Urutan ember Q-PFQ-3 (mengendap di atas semua, ditangani terpisah). */
const STAGE_ORDER: Record<PerformanceQueueStageBucket, number> = {
  "menunggu-finalisasi": 0,
  "menunggu-atasan": 1,
  "belum-nilai-diri": 2,
  "belum-ada-ulasan": 3,
}

export function goalPairKey(cycleId: number, employeeId: number): string {
  return `${cycleId}:${employeeId}`
}

function stageBucketFor(
  status: string | null,
): PerformanceQueueStageBucket | null {
  if (status == null) return "belum-ada-ulasan"
  if (status === "draft") return "belum-nilai-diri"
  if (status === "self_submitted") return "menunggu-atasan"
  if (status === "manager_reviewed") return "menunggu-finalisasi"
  // finalized + status liar: di luar antrean (BR-PFQ-03, AC-PFQ-B1).
  return null
}

export function buildPerformanceQueue(
  inputs: readonly PerformanceQueueInput[],
  options: PerformanceQueueOptions = {},
): PerformanceQueue {
  const today = getWibTodayUtcDate(options.now ?? new Date())
  const goalPairSet = new Set<string>()
  const rows: PerformanceQueueRow[] = []
  const cycles: PerformanceQueueCycleSummary[] = []

  for (const input of inputs) {
    for (const pair of input.goalPairs) goalPairSet.add(pair)

    const cycle = input.cycle
    // BR-PFQ-01: populasi hanya siklus active dan tidak terhapus-lunak.
    if (cycle.cycleStatus !== "active" || cycle.cycleDeletedAt != null) {
      continue
    }

    const periodEndDay = getWibTodayUtcDate(cycle.periodEnd)
    // EC-PFQ-8: periodEnd hari ini persis belum lewatiAkhirPeriode.
    const lewatiAkhirPeriode = today.getTime() > periodEndDay.getTime()
    const periodStartDay = getWibTodayUtcDate(cycle.periodStart)

    const reviewByEmployee = new Map<number, PerformanceQueueReviewInput>()
    for (const review of input.reviews) {
      if (review.cycleId !== cycle.cycleId) continue
      reviewByEmployee.set(review.employeeId, review)
    }

    const cycleSummary: PerformanceQueueCycleSummary = {
      cycleId: cycle.cycleId,
      cycleName: cycle.cycleName,
      mengendap: 0,
      menunggu: 0,
      perStage: {
        "menunggu-finalisasi": 0,
        "menunggu-atasan": 0,
        "belum-nilai-diri": 0,
        "belum-ada-ulasan": 0,
      },
      totalBelumSelesai: 0,
    }

    for (const employee of input.employees) {
      // BR-PFQ-06/Q-PFQ-5: populasi karyawan aktif tidak terhapus saja.
      if (employee.employeeDeletedAt != null || !employee.employeeIsActive) {
        continue
      }

      const review = reviewByEmployee.get(employee.employeeId) ?? null
      const stageBucket = stageBucketFor(review?.status ?? null)
      if (stageBucket == null) continue

      // Acuan umur ganda Q-PFQ-3: tahap menunggu atasan/finalisasi dari
      // updatedAt review; tahap sebelum review bergerak dari periodStart.
      const referenceDay =
        review != null &&
        (review.status === "self_submitted" ||
          review.status === "manager_reviewed")
          ? getWibTodayUtcDate(review.updatedAt)
          : periodStartDay
      const rawDays = Math.round(
        (today.getTime() - referenceDay.getTime()) / MS_PER_DAY,
      )
      const umurMenungguHari = Math.max(0, rawDays)

      // Q-PFQ-1: mengendap hanya sesudah periodEnd lewat + umur >= 7.
      const level: PerformanceQueueLevel =
        lewatiAkhirPeriode && umurMenungguHari >= PERFORMANCE_QUEUE_STALE_DAYS
          ? "mengendap"
          : "menunggu"

      rows.push({
        cycleId: cycle.cycleId,
        cycleSlug: cycle.cycleSlug,
        cycleName: cycle.cycleName,
        periodEnd: cycle.periodEnd,
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        stageBucket,
        stageLabel: PERFORMANCE_QUEUE_STAGE_LABELS[stageBucket],
        level,
        levelLabel: PERFORMANCE_QUEUE_LEVEL_LABELS[level],
        umurMenungguHari,
        lewatiAkhirPeriode,
        tanpaSasaran: !goalPairSet.has(
          goalPairKey(cycle.cycleId, employee.employeeId),
        ),
        selfScore: review?.selfScore ?? null,
        managerScore: review?.managerScore ?? null,
      })

      cycleSummary.perStage[stageBucket] += 1
      cycleSummary[level] += 1
      cycleSummary.totalBelumSelesai += 1
    }

    cycles.push(cycleSummary)
  }

  // Q-PFQ-3: mengendap dulu, lalu urutan ember, umur tertua, id naik.
  rows.sort((a, b) => {
    if (a.level !== b.level) return a.level === "mengendap" ? -1 : 1
    if (a.stageBucket !== b.stageBucket) {
      return STAGE_ORDER[a.stageBucket] - STAGE_ORDER[b.stageBucket]
    }
    if (a.umurMenungguHari !== b.umurMenungguHari) {
      return b.umurMenungguHari - a.umurMenungguHari
    }
    if (a.employeeId !== b.employeeId) return a.employeeId - b.employeeId
    return a.cycleId - b.cycleId
  })

  cycles.sort((a, b) => a.cycleId - b.cycleId)

  return {
    rows,
    cycles,
    summary: {
      mengendap: rows.filter((r) => r.level === "mengendap").length,
      menunggu: rows.filter((r) => r.level === "menunggu").length,
      totalBelumSelesai: rows.length,
    },
    staleDays: PERFORMANCE_QUEUE_STALE_DAYS,
  }
}
