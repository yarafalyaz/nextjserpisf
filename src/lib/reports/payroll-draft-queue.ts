/**
 * F-2026-10-26-070-S tahap 1 — antrean slip gaji draft mengendap.
 *
 * Turunan murni baca-saja: populasi Payroll `status = "draft"` persis
 * dalam scope HR pembaca (BR-PDQ-01). Payload TANPA nominal gaji dalam
 * bentuk apa pun (BR-PDQ-03): tidak ada baseSalary/netSalary/grossSalary/
 * komponen/potongan/BPJS/PPh21/totalAmount — satu-satunya angka agregat
 * sah = hitungan slip.
 *
 * PUTUSAN LEAD Q-PDQ-1/2/4 (PR #1043 merged, 26 Okt 2026 19:10 WIB):
 * - Q-PDQ-1: ambang `mengendap` = umur >= 3 hari kalender WIB sejak
 *   `createdAt`; == ambang termasuk mengendap (konstanta di bawah).
 * - Q-PDQ-2: label/notice/kolom verbatim §1 spec — satu konstanta label
 *   server; UI menempel apa adanya.
 * - Q-PDQ-4: key baca `process_payroll` saja (loader menegakkan);
 *   `getHrScope` department/all fail-closed sebelum query, self/none →
 *   kosong (BR-PDQ-02/04). Nama karyawan per baris TAMPIL dalam scope.
 * - Urutan: mengendap dulu lalu umur tertua, seri documentNo asc
 *   (Q-PDQ-6 tertanam). Rekap = hitungan slip per periode/tingkat atas
 *   baris yang sama persis (BR-PDQ-08).
 *
 * Pure (tanpa Prisma/DOM). Loader: `payroll-draft-queue-data.ts`.
 */

import { getWibTodayUtcDate, WIB_OFFSET_HOURS } from "@/lib/utils/attendance-time"

/** Ambang umur draft (hari kalender WIB) untuk tingkat `mengendap` (Q-PDQ-1: 3). */
export const PAYROLL_DRAFT_STALE_DAYS = 3

export const PAYROLL_DRAFT_LEVELS = ["mengendap", "menunggu"] as const

export type PayrollDraftLevel = (typeof PAYROLL_DRAFT_LEVELS)[number]

/** Label tingkat verbatim Q-PDQ-2 — UI menempel apa adanya. */
export const PAYROLL_DRAFT_LEVEL_LABELS: Record<PayrollDraftLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu Proses",
}

/** Judul kolom verbatim Q-PDQ-2. */
export const PAYROLL_DRAFT_COLUMN_LABELS = {
  period: "Periode",
  range: "Rentang",
  type: "Tipe",
  createdBy: "Dibuat Oleh",
  age: "Menunggu",
} as const

/** Notice verbatim Q-PDQ-2 — UI menempel apa adanya. */
export const PAYROLL_DRAFT_NOTICE_TEXT =
  "Daftar ini hanya slip gaji yang masih draft. Slip draft belum disetujui dan belum dibayar; proses lewat detail slip. Nominal gaji tidak ditampilkan di daftar ini."

const MS_PER_DAY = 86_400_000

export interface PayrollDraftInput {
  payrollId: number
  slug: string | null
  documentNo: string
  /** Status Payroll apa adanya; builder hanya menerima persis "draft". */
  status: string
  /** Payroll.employeeId; null = tanpa karyawan tercatat (EC-PDQ-2). */
  employeeId: number | null
  /** Nama karyawan verbatim; null tampil `—` (EC-PDQ-2). */
  employeeName: string | null
  /** Label periode apa adanya — BUKAN kunci unik (BR-PDQ-05). */
  period: string
  /** Tipe slip apa adanya (mis. REGULAR). */
  type: string
  startDate: Date
  endDate: Date
  /** Payroll.createdBy = User.id; nama diselesaikan loader massal. */
  createdByName: string | null
  createdAt: Date
}

export interface PayrollDraftRow extends PayrollDraftInput {
  tingkat: PayrollDraftLevel
  tingkatLabel: string
  /** Hari kalender WIB sejak createdAt; masa depan = 0 (EC-PDQ-4). */
  umurDraftHari: number
  /** createdAt sesudah hari laporan (jam server) — umur ditahan 0. */
  umurDariMasaDepan: boolean
}

export interface PayrollDraftPeriodCount {
  period: string
  levelCounts: Record<PayrollDraftLevel, number>
  total: number
}

export interface PayrollDraftQueue {
  rows: PayrollDraftRow[]
  /** Hitungan per tingkat atas baris tampil. */
  levelCounts: Record<PayrollDraftLevel, number>
  /** Hitungan slip per label periode atas baris tampil yang sama. */
  periodCounts: PayrollDraftPeriodCount[]
  totalDocuments: number
}

/** Tengah malam UTC hari kalender WIB dari sebuah instan. */
function wibCalendarDay(instant: Date): Date {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3_600_000)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

export function derivePayrollDraftAge(
  createdAt: Date,
  todayUtcMidnight: Date,
): { umurDraftHari: number; umurDariMasaDepan: boolean } {
  const createdDay = wibCalendarDay(createdAt)
  const diff = Math.round((todayUtcMidnight.getTime() - createdDay.getTime()) / MS_PER_DAY)
  return { umurDraftHari: Math.max(0, diff), umurDariMasaDepan: diff < 0 }
}

export function buildPayrollDraftQueue(
  inputs: PayrollDraftInput[],
  now: Date = new Date(),
  staleDays: number = PAYROLL_DRAFT_STALE_DAYS,
): PayrollDraftQueue {
  const today = getWibTodayUtcDate(now)
  const rows: PayrollDraftRow[] = []

  for (const input of inputs) {
    if (input.status !== "draft") continue
    const { umurDraftHari, umurDariMasaDepan } = derivePayrollDraftAge(input.createdAt, today)
    const tingkat: PayrollDraftLevel = umurDraftHari >= staleDays ? "mengendap" : "menunggu"
    rows.push({
      ...input,
      tingkat,
      tingkatLabel: PAYROLL_DRAFT_LEVEL_LABELS[tingkat],
      umurDraftHari,
      umurDariMasaDepan,
    })
  }

  const LEVEL_ORDER: Record<PayrollDraftLevel, number> = { mengendap: 0, menunggu: 1 }
  rows.sort((a, b) => {
    const levelDiff = LEVEL_ORDER[a.tingkat] - LEVEL_ORDER[b.tingkat]
    if (levelDiff !== 0) return levelDiff
    // Dalam tingkat: umur tertua dulu = createdAt menaik.
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
    if (createdDiff !== 0) return createdDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo)
    if (docDiff !== 0) return docDiff
    return a.payrollId - b.payrollId
  })

  const levelCounts: Record<PayrollDraftLevel, number> = { mengendap: 0, menunggu: 0 }
  const periodMap = new Map<string, PayrollDraftPeriodCount>()
  for (const row of rows) {
    levelCounts[row.tingkat] += 1
    let entry = periodMap.get(row.period)
    if (!entry) {
      entry = { period: row.period, levelCounts: { mengendap: 0, menunggu: 0 }, total: 0 }
      periodMap.set(row.period, entry)
    }
    entry.levelCounts[row.tingkat] += 1
    entry.total += 1
  }

  return {
    rows,
    levelCounts,
    periodCounts: [...periodMap.values()],
    totalDocuments: rows.length,
  }
}
