/**
 * Kompensasi akhir kontrak PKWT (F-2026-10-24-132-V, vonis BOT 4) — builder
 * murni tanpa Prisma.
 *
 * - Putusan 1: kompensasi = masaKerjaBulan/12 x basis (pokok + tunjangan
 *   tetap), masa pecahan tanggal presisi 4-desimal, <1 bulan ditolak,
 *   per segmen, pengakhiran dini berhenti tanggal aktual.
 * - Putusan 3: akrual bulanan basis/12; bulan terakhir segmen menutup ke
 *   nominal peristiwa persis (selisih sen di bulan terakhir).
 * - Putusan 5: rekonsiliasi tiga arah peristiwa vs GL 210207 vs slip terbayar.
 *
 * Tanggal = hari kalender WIB (pola employee-lifecycle wibDayNumber).
 */

import { formatNumber } from "@/lib/utils/format"
import { safeRound } from "@/lib/utils/math"

const DAY_MS = 24 * 60 * 60 * 1000
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

function wibDayNumber(date: Date): number {
  return Math.floor((date.getTime() + WIB_OFFSET_MS) / DAY_MS)
}

/** Awal bulan kalender WIB (UTC midnight tanggal WIB itu). */
function wibMonthStart(date: Date): Date {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS)
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - WIB_OFFSET_MS,
  )
}

function daysInWibMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * Masa kerja bulan pecahan (Putusan 1): bulan penuh terlayani dari start
 * sampai end inklusif + sisa hari / hari bulan kalender bulan sisa.
 * Contoh beku: 1 Jan-30 Jun = 6,0000; 1 Jan-15 Jun = 5 + 15/30 = 5,5000.
 * Presisi 4 desimal; DILARANG bulatkan ke bulan penuh.
 */
export function computeServiceMonths(start: Date, end: Date): number {
  const startDay = wibDayNumber(start)
  const endDay = wibDayNumber(end)
  if (endDay < startDay) return 0
  const s = new Date(start.getTime() + WIB_OFFSET_MS)
  const e = new Date(end.getTime() + WIB_OFFSET_MS)
  let months =
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - s.getUTCMonth())
  // Tanggal jangkar bulan penuh terakhir: start + months bulan.
  const anchor = new Date(
    Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + months, s.getUTCDate()),
  )
  const anchorDay = Math.floor(anchor.getTime() / DAY_MS)
  const endUtcDay = Math.floor(
    Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()) / DAY_MS,
  )
  if (anchorDay > endUtcDay) {
    // Jangkar melewati end (mis. start 31 Jan): mundur satu bulan penuh,
    // sisa hari inklusif dari jangkar mundur itu / hari bulan end.
    months -= 1
    const prev = new Date(
      Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + months, s.getUTCDate()),
    )
    const prevDay = Math.floor(prev.getTime() / DAY_MS)
    const remDays = endUtcDay - prevDay + 1
    return safeRound(
      months + remDays / daysInWibMonth(e.getUTCFullYear(), e.getUTCMonth()),
      4,
    )
  }
  const remDays = endUtcDay - anchorDay + 1
  if (remDays <= 0) return safeRound(months, 4)
  // Sisa inklusif (vonis: 1 Jan-15 Jun = 5 + 15/30; jangkar 1 Jun, sisa
  // 1..15 Jun / 30 hari Jun).
  return safeRound(
    months + remDays / daysInWibMonth(e.getUTCFullYear(), e.getUTCMonth()),
    4,
  )
}

/** Nominal peristiwa: masa/12 x basis, safeRound sen hasil akhir saja. */
export function computeCompensationAmount(
  serviceMonths: number,
  basisMonthly: number,
): number {
  return safeRound((serviceMonths / 12) * basisMonthly, 2)
}

export const PKWT_MSG = {
  underOneMonth: (months: number) =>
    `Masa kerja ${months} bulan kurang dari 1 bulan — kompensasi PKWT tidak berhak (PP 35/2021 Pasal 15(3)); peristiwa ditolak.`,
  basisZero: () =>
    `Basis upah kompensasi PKWT nol/negatif — peristiwa ditolak. Basis = gaji pokok + tunjangan tetap bulan terakhir segmen.`,
  notPkwt: (status: string | null) =>
    `Karyawan berstatus '${status ?? "belum diatur"}' — peristiwa kompensasi hanya untuk PKWT.`,
  mappingMissing: () =>
    `Mapping akun kompensasi PKWT belum lengkap — isi pkwtCompensationExpenseAccountId (600028 Beban Kompensasi PKWT) dan pkwtCompensationPayableAccountId (210207 Utang Kompensasi PKWT) di Pengaturan > Mapping Akun.`,
  forbiddenAccount: (code: string) =>
    `Akun ${code} dilarang untuk kompensasi PKWT (600005/210204 rumah pesangon/potongan gaji berjalan). Pakai 600028/210207 lewat mapping.`,
  accountInactive: (code: string) =>
    `Akun mapping kompensasi PKWT ${code} tidak aktif/terhapus — perbaiki mapping di Pengaturan > Mapping Akun.`,
  segmentOverlap: () =>
    `Segmen kompensasi PKWT ini beririsan dengan peristiwa aktif karyawan yang sama — satu segmen satu peristiwa.`,
  agreementRequired: () =>
    `Nominal kesepakatan usaha mikro/kecil wajib dokumen kesepakatan tertulis tertaut (agreementDocumentRef). Tanpa dokumen, rumus umum berlaku.`,
  notApproved: () =>
    `Peristiwa kompensasi PKWT belum disetujui/nominal belum terbekukan — tidak boleh ditarik ke slip.`,
  alreadyPaid: () =>
    `Peristiwa kompensasi PKWT ini sudah punya baris slip — satu peristiwa paling banyak satu baris slip terbayar.`,
  partialForbidden: () =>
    `Pembayaran parsial kompensasi PKWT ditolak — nominal slip wajib sama dengan nominal peristiwa penuh.`,
  separateDocumentForbidden: () =>
    `Kompensasi PKWT wajib dibayar lewat slip gaji dari peristiwa terbekukan (Q-EMP-5); dokumen bayar terpisah ditolak.`,
} as const

export interface PkwtAccrualMonthPlan {
  period: string
  amount: number
  isClosingMonth: boolean
}

/**
 * Rencana akrual segmen (Putusan 3): per bulan kalender dari segmentStart
 * s.d. segmentEnd, nominal = kenaikan masa bulan itu x basis/12 dibulatkan
 * sen; bulan terakhir menutup ke nominal peristiwa persis.
 */
export function planSegmentAccruals(input: {
  segmentStart: Date
  segmentEnd: Date
  basisMonthly: number
  eventAmount: number
}): PkwtAccrualMonthPlan[] {
  const { segmentStart, segmentEnd, basisMonthly, eventAmount } = input
  const plans: PkwtAccrualMonthPlan[] = []
  let cursor = wibMonthStart(segmentStart)
  const lastMonth = wibMonthStart(segmentEnd)
  let accrued = 0
  while (cursor.getTime() <= lastMonth.getTime()) {
    const shifted = new Date(cursor.getTime() + WIB_OFFSET_MS)
    const y = shifted.getUTCFullYear()
    const m = shifted.getUTCMonth()
    const period = `${y}-${String(m + 1).padStart(2, "0")}`
    const monthEnd = new Date(Date.UTC(y, m + 1, 0) - WIB_OFFSET_MS)
    const segSliceStart = cursor.getTime() < segmentStart.getTime() ? segmentStart : cursor
    const segSliceEnd = monthEnd.getTime() > segmentEnd.getTime() ? segmentEnd : monthEnd
    const sliceMonths = computeServiceMonths(segSliceStart, segSliceEnd)
    const isClosingMonth = cursor.getTime() === lastMonth.getTime()
    let amount: number
    if (isClosingMonth) {
      amount = safeRound(eventAmount - accrued, 2)
    } else {
      amount = safeRound((sliceMonths / 12) * basisMonthly, 2)
      accrued = safeRound(accrued + amount, 2)
    }
    plans.push({ period, amount, isClosingMonth })
    cursor = new Date(Date.UTC(y, m + 1, 1) - WIB_OFFSET_MS)
  }
  return plans
}

// ─── Rekonsiliasi tiga arah (Putusan 5) ───

export interface PkwtReconciliationInput {
  employeeId: number
  /** Σ peristiwa terbekukan (approved+paid) per karyawan. */
  frozenEventTotal: number
  /** Saldo GL akun utang kompensasi POSTED+REVERSED (kredit-debit, pasangan reversal neto nol) total perusahaan. */
  glPayableBalance: number
  /** Σ baris kompensasi slip terbayar (status paid). */
  paidSlipTotal: number
  /** Σ akrual subledger per karyawan. */
  accrualSubledgerTotal: number
}

export interface PkwtReconciliationRow extends PkwtReconciliationInput {
  /** Utang seharusnya = peristiwa terbekukan − slip terbayar. */
  expectedPayable: number
  /** Selisih subledger akrual vs GL (agregat; GL tak per karyawan). */
  accrualVsEventDiff: number
  findings: string[]
}

export function buildPkwtReconciliation(
  rows: readonly PkwtReconciliationInput[],
): PkwtReconciliationRow[] {
  return rows.map((r) => {
    const expectedPayable = safeRound(r.frozenEventTotal - r.paidSlipTotal, 2)
    const accrualVsEventDiff = safeRound(
      r.frozenEventTotal - r.accrualSubledgerTotal - r.paidSlipTotal,
      2,
    )
    const findings: string[] = []
    if (r.paidSlipTotal > 0 && r.accrualSubledgerTotal === 0 && r.frozenEventTotal > 0) {
      findings.push(
        "Slip kompensasi terbayar tanpa akrual berjalan — kaki debit wajib 600028 (bukan 210207) sesuai snapshot baris; pastikan bukan beban ganda.",
      )
    }
    if (accrualVsEventDiff !== 0 && r.frozenEventTotal > 0) {
      findings.push(
        `Selisih peristiwa terbekukan vs (akrual + slip terbayar) Rp${formatNumber(accrualVsEventDiff)} — segmen belum terakrual penuh/belum dibayar; tampil sebagai temuan, bukan dipilih diam-diam.`,
      )
    }
    return { ...r, expectedPayable, accrualVsEventDiff, findings }
  })
}

/** Label daftar belum-dibayar (Putusan 3): kontrak berakhir, saldo utang > 0. */
export const PKWT_UNPAID_LABEL = "Kompensasi PKWT belum dibayar"

export interface PkwtUnpaidRow {
  employeeId: number
  name: string
  segmentEnd: Date
  frozenAmount: number
  paidAmount: number
  outstandingAmount: number
  label: string
}

export function buildPkwtUnpaidList(
  rows: readonly Omit<PkwtUnpaidRow, "outstandingAmount" | "label">[],
): PkwtUnpaidRow[] {
  return rows
    .map((r) => ({
      ...r,
      outstandingAmount: safeRound(r.frozenAmount - r.paidAmount, 2),
      label: PKWT_UNPAID_LABEL,
    }))
    .filter((r) => r.outstandingAmount > 0)
}

// ─── Laporan gabungan (dipakai loader pkwt-compensation-data.ts) ───

export interface PkwtEventReportInput {
  eventId: number
  employeeId: number
  employeeName: string
  segmentStart: Date
  segmentEnd: Date
  serviceMonths: number
  amount: number
  status: string
  isLegacy: boolean
  accruedToDate: number
  paidAmount: number
}

export interface PkwtCompensationRow extends PkwtEventReportInput {
  outstandingAmount: number
}

export interface PkwtAnomaly {
  code: string
  label: string
  detail: string
}

export interface PkwtCompensationReport {
  rows: PkwtCompensationRow[]
  /**
   * Saldo GL utang kompensasi. Bila input `glIsCompanyWide` true, saldo ini
   * satu perusahaan sedangkan rows/totals adalah cakupan scope HR pemanggil:
   * perbedaan cakupan BUKAN temuan GL_VS_EVENT_DIFF.
   */
  glPayableBalance: number
  /** True bila glPayableBalance tidak se-cakupan dengan rows (scope HR). */
  glIsCompanyWide?: boolean
  /** True bila glPayableBalance dikomparkan apa adanya (scope `all`). */
  glComparableToScope?: boolean
  expectedPayableTotal: number
  accrualSubledgerTotal: number
  paidSlipTotal: number
  unpaidList: PkwtUnpaidRow[]
  pendingApprovalSlips: PkwtUnpaidRow[]
  anomalies: PkwtAnomaly[]
}

export function buildPkwtCompensationReport(input: {
  events: readonly PkwtEventReportInput[]
  glPayableBalance: number
  mappingMissing: boolean
  /**
   * True bila glPayableBalance adalah saldo satu perusahaan sedangkan
   * events sudah terfilter scope HR terbatas (self/department). Dalam mode
   * itu selisih GL vs total ter-scope adalah artefak cakupan, BUKAN temuan
   * rekonsiliasi: GL_VS_EVENT_DIFF tidak diterbitkan.
   */
  glIsCompanyWide?: boolean
}): PkwtCompensationReport {
  const rows: PkwtCompensationRow[] = input.events.map((e) => ({
    ...e,
    outstandingAmount: safeRound(e.amount - e.paidAmount, 2),
  }))
  const frozen = rows.filter((r) => r.status === "approved" || r.status === "paid")
  const accrualSubledgerTotal = safeRound(
    rows.reduce((s, r) => s + r.accruedToDate, 0),
    2,
  )
  const paidSlipTotal = safeRound(rows.reduce((s, r) => s + r.paidAmount, 0), 2)
  const expectedPayableTotal = safeRound(
    frozen.reduce((s, r) => s + r.amount, 0) - paidSlipTotal,
    2,
  )
  const anomalies: PkwtAnomaly[] = []
  const glIsCompanyWide = input.glIsCompanyWide ?? false
  const glDiff = safeRound(input.glPayableBalance - expectedPayableTotal, 2)
  if (!input.mappingMissing && !glIsCompanyWide && glDiff !== 0 && frozen.length > 0) {
    anomalies.push({
      code: "GL_VS_EVENT_DIFF",
      label: "GL vs peristiwa",
      detail: `Saldo GL 210207 Rp${formatNumber(input.glPayableBalance)} vs utang seharusnya (peristiwa terbekukan − slip terbayar) Rp${formatNumber(expectedPayableTotal)} — selisih Rp${formatNumber(glDiff)}; tampil sebagai temuan, bukan dipilih diam-diam.`,
    })
  }
  const subDiff = safeRound(accrualSubledgerTotal + paidSlipTotal - frozen.reduce((s, r) => s + r.amount, 0), 2)
  if (subDiff !== 0 && frozen.length > 0) {
    anomalies.push({
      code: "ACCRUAL_VS_EVENT_DIFF",
      label: "Akrual vs peristiwa",
      detail: `Subledger akrual + slip terbayar vs peristiwa terbekukan selisih Rp${formatNumber(subDiff)} — segmen belum terakrual penuh atau belum dibayar.`,
    })
  }
  for (const r of rows) {
    if (r.status === "paid" && r.accruedToDate === 0 && !r.isLegacy) {
      anomalies.push({
        code: "PAID_WITHOUT_ACCRUAL",
        label: "Terbayar tanpa akrual",
        detail: `Peristiwa #${r.eventId} (${r.employeeName}) terbayar tanpa akrual berjalan — kaki debit wajib 600028 sesuai snapshot baris.`,
      })
    }
  }
  const unpaidList = buildPkwtUnpaidList(
    frozen
      .filter((r) => r.status !== "paid")
      .map((r) => ({
        employeeId: r.employeeId,
        name: r.employeeName,
        segmentEnd: r.segmentEnd,
        frozenAmount: r.amount,
        paidAmount: r.paidAmount,
      })),
  )
  return {
    rows,
    glPayableBalance: input.glPayableBalance,
    glIsCompanyWide,
    glComparableToScope: !glIsCompanyWide,
    expectedPayableTotal,
    accrualSubledgerTotal,
    paidSlipTotal,
    unpaidList,
    pendingApprovalSlips: [],
    anomalies,
  }
}
