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
import { isMarriedStatus } from "@/lib/services/payroll-statutory.service"
import { toLocalDateOnly } from "@/lib/utils/date-only"

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
  // Field tambahan ekspor Lapis 1 (F-028-I §I.2) — opsional agar pemanggil
  // rekap lama tak berubah; loader rekap yang sama mengisinya.
  /** Employee.idNumber (NIK) mentah. */
  nik?: string | null
  /** Employee.maritalStatus saat ekspor (fallback PTKP bila snapshot tak terbaca). */
  maritalStatus?: string | null
  /** Employee.dependents saat ekspor (fallback PTKP). */
  dependents?: number | null
  /** Position.name saat ekspor (informatif bukti, bukan kolom berkas). */
  position?: string | null
  /** Payroll.type (REGULAR/THR/…) untuk bukti penggabungan se-masa. */
  type?: string | null
  /** Payroll.paymentDate; tanggal pemotongan = paymentDate ?? endDate slip terakhir. */
  paymentDate?: Date | string | null
  /** Payroll.endDate. */
  endDate?: Date | string | null
}

export type Pph21RecapMethod = "TER" | "LEGACY_PRE_TER" | "UNKNOWN"

/** Info metode dari snapshot F-026; null bila snapshot kosong/tidak terbaca. */
export interface Pph21TerSnapshotInfo {
  method: Exclude<Pph21RecapMethod, "UNKNOWN">
  category: string | null
  ratePct: number | null
  periodKind: string | null
  overWithheld: number | null
  /** Snapshot F-026 §I.4: status kawin mentah saat slip terbit. */
  maritalStatusRaw: string | null
  /** Snapshot F-026 §I.4: tanggungan ter-clamp saat slip terbit. */
  dependentsClamped: number | null
  /** Kolom dependents ≠ angka pada kode status (F-026 §1; kolom menang). */
  statusDependentsMismatch: boolean
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
    maritalStatusRaw: strOrNull(ter.maritalStatusRaw),
    dependentsClamped: numOrNull(ter.dependentsClamped),
    statusDependentsMismatch: ter.statusDependentsMismatch === true,
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

/**
 * Baris ekspor internal Lapis 1 (F-028-I §I.2): satu baris per
 * (karyawan, masa) dari slip approved/paid yang sama dengan agregat
 * rekap — BUKAN rekonstruksi dari dua agregat. Angka = slip beku.
 */
export interface Pph21ExportRow {
  period: string
  employeeId: number | null
  employeeName: string
  npwp: string | null
  nik: string | null
  /** Kode PTKP §I.4 (snapshot slip terakhir; fallback master). null = tak terturunkan. */
  ptkpCode: string | null
  /** false bila PTKP dari master berjalan karena snapshot tak terbaca (§I.4). */
  ptkpFromSnapshot: boolean
  terCategory: string | null
  taxObjectCode: "21-100-01"
  gross: number
  /** null pada masa final / LEGACY / UNKNOWN (§I.3 kolom 11). */
  terRatePct: number | null
  pph21: number
  /** Snapshot masa final; 0 selain masa final (§I.5 butir 8). */
  overWithheld: number
  /** Masa final tanpa snapshot overWithheld terbaca → null (§I.3 kolom 13). */
  overWithheldRead: boolean
  /** "YYYY-MM-DD" dari slip terakhir (paymentDate ?? endDate); null = tak terbaca. */
  withholdingDate: string | null
  method: Pph21RecapMethod
  periodKind: string | null
  slipCount: number
  slipTypes: string[]
  /** Metode >1 jenis tergabung se-(karyawan,masa) (§I.3 kolom 15). */
  mixedMethods: boolean
  /** statusDependentsMismatch pada snapshot mana pun (§I.4). */
  statusDependentsMismatch: boolean
}

export interface Pph21Recap {
  /** Agregasi masa, urut periode naik. */
  periods: Pph21RecapPeriodRow[]
  /** Agregasi tahunan per karyawan, urut nama. */
  employeesByYear: Map<number, Pph21RecapEmployeeRow[]>
  /** Baris ekspor Lapis 1 per (karyawan, masa), urut masa lalu employeeId (§I.3). */
  exportRows: Pph21ExportRow[]
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

const clampDependents = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(3, Math.max(0, Math.floor(v))) : null

/** Kode PTKP §I.4: TK/<dep> tidak kawin, K/<dep> kawin; null bila status kosong. */
export function pph21PtkpCode(maritalStatus: string | null, dependents: number | null): string | null {
  if (maritalStatus == null || maritalStatus.trim() === "" || dependents == null) return null
  return `${isMarriedStatus(maritalStatus) ? "K" : "TK"}/${dependents}`
}

function toDateOnly(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null
  }
  return Number.isNaN(value.getTime()) ? null : toLocalDateOnly(value)
}

type ExportBucket = {
  first: Pph21RecapSlipInput
  last: Pph21RecapSlipInput
  lastInfo: Pph21TerSnapshotInfo | null
  gross: number
  pph21: number
  slipCount: number
  slipTypes: string[]
  methods: Set<string>
  mismatch: boolean
}

export function buildPph21Recap(slips: readonly Pph21RecapSlipInput[]): Pph21Recap {
  const recognised = slips.filter((s) => (PPH21_RECAP_STATUSES as readonly string[]).includes(s.status))
  const excludedSlips = slips.length - recognised.length

  const periodBuckets = new Map<string, Bucket & { year: number; month: number }>()
  const exportBuckets = new Map<string, ExportBucket>()
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
    const xb = exportBuckets.get(`${s.period}|${empKey(s)}`) ?? {
      first: s, last: s, lastInfo: info, gross: 0, pph21: 0, slipCount: 0,
      slipTypes: [], methods: new Set<string>(), mismatch: false,
    }
    xb.last = s
    xb.lastInfo = info
    xb.gross = safeAdd(xb.gross, s.grossSalary, 2)
    xb.pph21 = safeAdd(xb.pph21, s.pph21, 2)
    xb.slipCount++
    const slipType = s.type ?? "REGULAR"
    if (!xb.slipTypes.includes(slipType)) xb.slipTypes.push(slipType)
    xb.methods.add(info?.method ?? "UNKNOWN")
    if (info?.statusDependentsMismatch) xb.mismatch = true
    exportBuckets.set(`${s.period}|${empKey(s)}`, xb)
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

  const exportRows: Pph21ExportRow[] = [...exportBuckets.entries()]
    .map(([key, xb]) => {
      const period = key.slice(0, key.indexOf("|"))
      const info = xb.lastInfo
      const method: Pph21RecapMethod = info?.method ?? "UNKNOWN"
      const isFinal = isFinalKind(info?.periodKind ?? null)
      const snapPtkp = info ? pph21PtkpCode(info.maritalStatusRaw, info.dependentsClamped) : null
      const masterPtkp = pph21PtkpCode(xb.last.maritalStatus ?? null, clampDependents(xb.last.dependents))
      return {
        period,
        employeeId: xb.last.employeeId,
        employeeName: xb.last.employeeName,
        npwp: xb.last.npwp,
        nik: xb.last.nik ?? null,
        ptkpCode: snapPtkp ?? masterPtkp,
        ptkpFromSnapshot: snapPtkp != null,
        terCategory: method === "TER" ? info?.category ?? null : null,
        taxObjectCode: "21-100-01" as const,
        gross: xb.gross,
        terRatePct: !isFinal && method === "TER" ? info?.ratePct ?? null : null,
        pph21: xb.pph21,
        overWithheld: isFinal && info?.overWithheld != null ? info.overWithheld : 0,
        overWithheldRead: !isFinal || info?.overWithheld != null,
        withholdingDate: toDateOnly(xb.last.paymentDate ?? xb.last.endDate),
        method,
        periodKind: info?.periodKind ?? null,
        slipCount: xb.slipCount,
        slipTypes: xb.slipTypes,
        mixedMethods: xb.methods.size > 1,
        statusDependentsMismatch: xb.mismatch,
      }
    })
    .sort((a, b) =>
      a.period.localeCompare(b.period)
      || (a.employeeId == null ? 1 : b.employeeId == null ? -1 : a.employeeId - b.employeeId)
      || a.employeeName.localeCompare(b.employeeName, "id-ID"))

  return {
    periods, employeesByYear, exportRows,
    totals: { ...totals, employees: allEmp.size },
    excludedSlips, unreadablePeriodSlips,
  }
}
