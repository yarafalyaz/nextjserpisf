/**
 * F-2026-10-21-028 (tahap read-model) — rekap PPh21 masa + tahunan dari
 * data payroll existing. Tanpa format ekspor DJP/e-Bupot (butuh vonis
 * format accountant terpisah).
 *
 * Sumber angka persis slip gaji terbit: `Payroll.pph21` + `grossSalary`
 * + `netSalary` kolom tersimpan, dan metadata metode dari
 * `statutorySnapshot.pph21Ter` (F-2026-10-21-026). Builder TIDAK hitung
 * ulang pajak — hanya agregasi baca slip berstatus approved/paid.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { safeAdd } from "@/lib/utils/math"

/** Status slip yang diakui final (sama payroll-reports-data + F-026 §4). */
export const PPH21_RECAP_STATUSES = ["approved", "paid"] as const

/** Satu slip payroll mentah (angka sudah Number dari Decimal di loader). */
export interface Pph21RecapSlipInput {
  employeeId: number | null
  employeeName: string
  npwp: string | null
  /** Masa pajak "YYYY-MM" (Payroll.period). */
  period: string
  status: string
  grossSalary: number
  pph21: number
  netSalary: number
  /** Payroll.statutorySnapshot mentah (Json), boleh null/obek lain. */
  statutorySnapshot: unknown
}

export type Pph21RecapMethod = "TER" | "LEGACY_PRE_TER" | "UNKNOWN"

/** Info metode dari snapshot F-026; null bila snapshot kosong/tidak terbaca. */
export interface Pph21TerSnapshotInfo {
  method: Exclude<Pph21RecapMethod, "UNKNOWN">
  category: string | null
  ratePct: number | null
  periodKind: string | null
  overWithheld: number | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * Parse `statutorySnapshot.pph21Ter`. Slip pra-F-026 / snapshot tanpa
 * segmen TER → null (bukan tebakan metode).
 */
export function parsePph21TerSnapshot(snapshot: unknown): Pph21TerSnapshotInfo | null {
  const ter = asRecord(asRecord(snapshot)?.pph21Ter)
  if (!ter) return null
  if (ter.method !== "TER" && ter.method !== "LEGACY_PRE_TER") return null
  return {
    method: ter.method,
    category: strOrNull(ter.category),
    ratePct: numOrNull(ter.ratePct),
    periodKind: strOrNull(ter.periodKind),
    overWithheld: numOrNull(ter.overWithheld),
  }
}

/** "YYYY-MM" → { year, month } atau null bila tidak terbaca. */
export function parsePph21Period(period: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(period)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  return month >= 1 && month <= 12 ? { year, month } : null
}

export interface Pph21RecapPeriodRow {
  period: string
  year: number
  month: number
  slips: number
  /** Karyawan distinct (employeeId; fallback nama bila employeeId null). */
  employees: number
  gross: number
  pph21: number
  net: number
  terSlips: number
  legacySlips: number
  /** Slip approved/paid tanpa segmen pph21Ter terbaca (pra-F-026 dsb). */
  unknownMethodSlips: number
  finalPeriodSlips: number
  /** Σ overWithheld snapshot masa final (>0 = wajib kembali ke karyawan). */
  overWithheld: number
}

export interface Pph21RecapEmployeeRow {
  employeeId: number | null
  employeeName: string
  npwp: string | null
  /** Jumlah masa dengan slip recognised dalam tahun ini. */
  periods: number
  slips: number
  gross: number
  pph21: number
  net: number
  terSlips: number
  legacySlips: number
  unknownMethodSlips: number
  /** Punya slip masa final (Desember / final resign) tahun ini. */
  hasFinalPeriod: boolean
  /** Σ overWithheld snapshot masa final karyawan. */
  overWithheld: number
}

export interface Pph21Recap {
  /** Agregasi masa, urut periode naik. */
  periods: Pph21RecapPeriodRow[]
  /** Agregasi tahunan per karyawan, urut nama. */
  employeesByYear: Map<number, Pph21RecapEmployeeRow[]>
  totals: { slips: number; employees: number; gross: number; pph21: number; net: number }
  /** Slip non-approved/paid yang dibuang builder (draft/cancelled/dll). */
  excludedSlips: number
  /** Slip recognised dengan period tidak terbaca — dibuang + dihitung. */
  unreadablePeriodSlips: number
}

function empKey(s: Pph21RecapSlipInput): string {
  return s.employeeId != null ? `id:${s.employeeId}` : `name:${s.employeeName}`
}

type Bucket = {
  slips: number
  periodSet: Set<string>
  empSet: Set<string>
  gross: number
  pph21: number
  net: number
  terSlips: number
  legacySlips: number
  unknownMethodSlips: number
  finalPeriodSlips: number
  overWithheld: number
}

function emptyBucket(): Bucket {
  return {
    slips: 0, periodSet: new Set(), empSet: new Set(),
    gross: 0, pph21: 0, net: 0,
    terSlips: 0, legacySlips: 0, unknownMethodSlips: 0,
    finalPeriodSlips: 0, overWithheld: 0,
  }
}

const isFinalKind = (k: string | null) => k != null && k.startsWith("final")

export function buildPph21Recap(slips: readonly Pph21RecapSlipInput[]): Pph21Recap {
  const recognised = slips.filter((s) => (PPH21_RECAP_STATUSES as readonly string[]).includes(s.status))
  const excludedSlips = slips.length - recognised.length

  const periodBuckets = new Map<string, Bucket & { year: number; month: number }>()
  const yearEmp = new Map<string, {
    employeeId: number | null; employeeName: string; npwp: string | null; b: Bucket
  }>()
  let unreadablePeriodSlips = 0
  const allEmp = new Set<string>()
  const totals = { slips: 0, gross: 0, pph21: 0, net: 0 }

  for (const s of recognised) {
    const parsed = parsePph21Period(s.period)
    if (!parsed) { unreadablePeriodSlips++; continue }
    const info = parsePph21TerSnapshot(s.statutorySnapshot)
    const isFinal = isFinalKind(info?.periodKind ?? null)

    const pb = periodBuckets.get(s.period) ?? { ...emptyBucket(), year: parsed.year, month: parsed.month }
    periodBuckets.set(s.period, pb)
    const key = `${parsed.year}|${empKey(s)}`
    const eb = yearEmp.get(key) ?? { employeeId: s.employeeId, employeeName: s.employeeName, npwp: s.npwp, b: emptyBucket() }
    yearEmp.set(key, eb)

    for (const b of [pb, eb.b]) {
      b.slips++
      b.periodSet.add(s.period)
      b.empSet.add(empKey(s))
      b.gross = safeAdd(b.gross, s.grossSalary, 2)
      b.pph21 = safeAdd(b.pph21, s.pph21, 2)
      b.net = safeAdd(b.net, s.netSalary, 2)
      if (info?.method === "TER") b.terSlips++
      else if (info?.method === "LEGACY_PRE_TER") b.legacySlips++
      else b.unknownMethodSlips++
      if (isFinal) b.finalPeriodSlips++
      if (isFinal && info?.overWithheld != null) b.overWithheld = safeAdd(b.overWithheld, info.overWithheld, 2)
    }
    totals.slips++
    totals.gross = safeAdd(totals.gross, s.grossSalary, 2)
    totals.pph21 = safeAdd(totals.pph21, s.pph21, 2)
    totals.net = safeAdd(totals.net, s.netSalary, 2)
    allEmp.add(empKey(s))
  }

  const periods: Pph21RecapPeriodRow[] = [...periodBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, b]) => ({
      period, year: b.year, month: b.month, slips: b.slips,
      employees: b.empSet.size, gross: b.gross, pph21: b.pph21, net: b.net,
      terSlips: b.terSlips, legacySlips: b.legacySlips,
      unknownMethodSlips: b.unknownMethodSlips,
      finalPeriodSlips: b.finalPeriodSlips, overWithheld: b.overWithheld,
    }))

  const employeesByYear = new Map<number, Pph21RecapEmployeeRow[]>()
  for (const [key, e] of yearEmp) {
    const year = Number(key.split("|")[0])
    const row: Pph21RecapEmployeeRow = {
      employeeId: e.employeeId, employeeName: e.employeeName, npwp: e.npwp,
      periods: e.b.periodSet.size, slips: e.b.slips,
      gross: e.b.gross, pph21: e.b.pph21, net: e.b.net,
      terSlips: e.b.terSlips, legacySlips: e.b.legacySlips,
      unknownMethodSlips: e.b.unknownMethodSlips,
      hasFinalPeriod: e.b.finalPeriodSlips > 0, overWithheld: e.b.overWithheld,
    }
    const arr = employeesByYear.get(year) ?? []
    arr.push(row)
    employeesByYear.set(year, arr)
  }
  for (const arr of employeesByYear.values()) arr.sort((a, b) => a.employeeName.localeCompare(b.employeeName, "id-ID"))

  return {
    periods, employeesByYear,
    totals: { ...totals, employees: allEmp.size },
    excludedSlips, unreadablePeriodSlips,
  }
}
