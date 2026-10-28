/**
 * Pisah run payroll mingguan/bulanan (F-2026-10-22-076-S) — builder murni.
 *
 * Sumber kebenaran: spec BOT 5 F-076-S (PR #519 MERGED) + vonis BOT 4
 * F-2026-10-22-077-V Q-PF-2/Q-PF-4 (PR #521 MERGED) di
 * docs/erp-research-backlog.md. Fisik kunci anti-dobel (Q-PF-3) diputus
 * BOT 3: @@unique([employeeId, startDate, endDate]) + penjaga irisan ini.
 *
 * Aturan yang dikodekan di sini (tanpa Prisma/DOM):
 * - BR-PF-02: run massal hanya memproses karyawan sefrekuensi; frekuensi
 *   lain terlewati + terhitung (bukan diam).
 * - BR-PF-03 / AC-PF-3: duplikat = irisan rentang slip aktif karyawan sama,
 *   bukan string period sama. Rentang bersebelahan persis (selesai = mulai
 *   slip lain) LOLOS; beririsan ditolak menyebut documentNo penabrak.
 * - V-PF2-1/V-PF2-5: period slip = "YYYY-MM" bulan endDate; format karangan
 *   "YYYY-MM-Wn" ditolak tulis (AC-PF2-5).
 * - V-PF2-4(i)/V-PF4-1 (fail-closed): run/slip WEEKLY tidak memotong BPJS
 *   per-slip penuh dan tidak memotong cicilan pinjaman apa pun — karyawan
 *   WEEKLY terlewati-terhitung alasan terpisah sampai agregator BPJS
 *   se-masa + nominal cicilan mingguan tersimpan diputus kartu turunan.
 *
 * Keluaran builder ini TIDAK memuat nominal gaji siapa pun (AC-PF-5):
 * hanya ID karyawan, alasan terlewati, dan nomor slip penabrak.
 */

export const PAYROLL_FREQUENCIES = ["MONTHLY", "WEEKLY"] as const
export type PayrollFrequency = (typeof PAYROLL_FREQUENCIES)[number]

export function isPayrollFrequency(value: unknown): value is PayrollFrequency {
  return typeof value === "string" && (PAYROLL_FREQUENCIES as readonly string[]).includes(value)
}

/** Alasan terlewati run massal (AC-PF-5: terhitung per alasan, tanpa nominal). */
export type PayrollRunSkipReason =
  | "frekuensiLain"
  | "pinjaman"
  | "bpjsBelumDidukung"
  | "plafonPotongan"
  | "irisan"
  | "berhenti"
  | "cakupan"

export const PAYROLL_RUN_SKIP_LABELS: Record<PayrollRunSkipReason, string> = {
  frekuensiLain: "Frekuensi bayar berbeda",
  pinjaman: "Pinjaman aktif — cicilan mingguan belum diatur tertulis",
  bpjsBelumDidukung: "BPJS mingguan belum didukung (agregator se-masa belum tersedia)",
  plafonPotongan: "Potongan melebihi plafon 50% upah (PP 36/2021 Pasal 65)",
  irisan: "Rentang beririsan slip existing",
  berhenti: "Karyawan berhenti — di luar populasi massal",
  cakupan: "Di luar cakupan akses HR — tidak dibuatkan slip",
}

export interface PayrollRunSkip {
  employeeId: number
  reason: PayrollRunSkipReason
  /** documentNo slip penabrak (hanya alasan irisan, AC-PF-3). */
  conflictDocumentNo: string | null
}

export interface PayrollRangeSlip {
  startDate: Date
  endDate: Date
  status: string
  documentNo: string
}

/** Status slip yang memblokir rentang baru (spec §2(b): bukan cancelled). */
export function isBlockingPayrollStatus(status: string): boolean {
  return status !== "cancelled" && status !== "canceled"
}

const DAY_MS = 24 * 60 * 60 * 1000

function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS)
}
/**
 * Slip penabrak untuk rentang baru [startDate, endDate], atau null bila
 * bersih. AC-PF-3 spec verbatim: "rentang bersebelahan persis (selesai =
 * mulai slip lain) -> lolos" — yaitu rentang baru yang mulai TEPAT pada
 * tanggal selesai slip existing tidak beririsan; yang beririsan adalah
 * tumpang-tindih ketat (mulai baru < selesai existing). Kedua rentang
 * dibaca setengah-terbuka [startDate, endDate): mulai baru pada tanggal
 * selesai existing = bersebelahan, bukan tabrakan. Konsekuensi jujur:
 * dua slip yang berbagi tepat satu tanggal batas (selesai lama = mulai
 * baru) keduanya sah; tanggal batas itu tercatat di slip lama.
 */
export function findPayrollRangeConflict(
  slips: readonly PayrollRangeSlip[],
  startDate: Date,
  endDate: Date,
): PayrollRangeSlip | null {
  const newStart = dayNumber(startDate)
  const newEnd = dayNumber(endDate)
  for (const slip of slips) {
    if (!isBlockingPayrollStatus(slip.status)) continue
    const existStart = dayNumber(slip.startDate)
    const existEnd = dayNumber(slip.endDate)
    if (newStart < existEnd && existStart < newEnd) return slip
  }
  return null
}

export interface PayrollPopulationEmployee {
  id: number
  paymentFrequency: string
  /**
   * Pinjaman aktif (remaining > 0) tanpa nominal cicilan mingguan
   * tersimpan (F-105-V butir 3). Field `hasActiveLoan` lama dihapus:
   * gerbang mingguan kini per-pinjaman ternominal, bukan per-karyawan.
   */
  hasActiveLoanWithoutWeeklyInstallment: boolean
}

/**
 * Pisah populasi run massal per frekuensi (BR-PF-02 + gerbang vonis).
 * - Frekuensi lain -> "frekuensiLain".
 * - WEEKLY berpinjaman aktif -> "pinjaman" (V-PF4-1, dicek lebih dulu:
 *   alasan statutori pinjaman lebih spesifik daripada BPJS).
 * - WEEKLY tanpa pinjaman -> "bpjsBelumDidukung" (V-PF2-4(i)): populasi
 *   murni WEEKLY di luar cakupan inti pertama, fail-closed.
 * - MONTHLY lolos apa adanya (perilaku existing tidak berubah).
 */
export function classifyPayrollRunPopulation(
  employees: readonly PayrollPopulationEmployee[],
  runFrequency: PayrollFrequency,
): { targetIds: number[]; skips: PayrollRunSkip[] } {
  const targetIds: number[] = []
  const skips: PayrollRunSkip[] = []
  for (const employee of employees) {
    if (employee.paymentFrequency !== runFrequency) {
      skips.push({ employeeId: employee.id, reason: "frekuensiLain", conflictDocumentNo: null })
      continue
    }
    if (runFrequency === "WEEKLY") {
      // Turunan F-076-S (vonis BOT 4 F-2026-10-23-103-V + F-105-V butir 3):
      // gerbang BPJS dicabut — agregator se-masa tersedia. Sisa gerbang
      // hanya pinjaman aktif tanpa nominal mingguan tersimpan.
      if (employee.hasActiveLoanWithoutWeeklyInstallment) {
        skips.push({ employeeId: employee.id, reason: "pinjaman", conflictDocumentNo: null })
        continue
      }
      targetIds.push(employee.id)
      continue
    }
    targetIds.push(employee.id)
  }
  return { targetIds, skips }
}

/** Hitung terlewati per alasan untuk hasil run (AC-PF-5, tanpa nominal). */
export function countPayrollRunSkips(
  skips: readonly PayrollRunSkip[],
): Record<PayrollRunSkipReason, number> {
  const counts: Record<PayrollRunSkipReason, number> = {
    frekuensiLain: 0,
    pinjaman: 0,
    bpjsBelumDidukung: 0,
    plafonPotongan: 0,
    irisan: 0,
    berhenti: 0,
    cakupan: 0,
  }
  for (const skip of skips) counts[skip.reason] += 1
  return counts
}

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * Period tulis wajib "YYYY-MM" persis (V-PF2-1/V-PF2-5): format karangan
 * "2026-10-W2" ditolak. Bulan period wajib sama dengan bulan endDate
 * (masa pajak = bulan endDate).
 */
export function assertPayrollPeriodMatchesEndDate(period: string, endDate: Date): void {
  if (!PERIOD_PATTERN.test(period)) {
    throw new Error(
      `Periode penggajian "${period}" tidak valid — wajib format "YYYY-MM" (bulan masa dari tanggal selesai).`,
    )
  }
  const expected = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, "0")}`
  if (period !== expected) {
    throw new Error(
      `Periode penggajian ${period} tidak sama dengan bulan tanggal selesai (${expected}) — masa pajak dibaca dari tanggal selesai.`,
    )
  }
}
