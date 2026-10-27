/**
 * Indonesian statutory payroll calculations: BPJS (employee portion) and PPh21.
 *
 * P1-6: tarif hidup di tabel `payroll_statutory_rules` berperiode
 * (effectiveFrom/effectiveTo + source). Konstanta di bawah = FALLBACK bila
 * tabel kosong (seed 2024) — JANGAN jadikan sumber kebenaran untuk tahun
 * pajak baru. Angka 2026+ NEEDS ACCOUNTANT/LEGAL CONFIRMATION.
 *
 * NOTE: pragmatic, auditable approximation. PPh21 uses the annualized
 * progressive method with PTKP based on marital status + dependents.
 */

// ── BPJS (employee-deducted portion) ─────────────────────────────────────────
const BPJS_HEALTH_EMPLOYEE_RATE = 0.01 // 1% Kesehatan (employee)
const BPJS_HEALTH_CEILING = 12_000_000 // salary ceiling for Kesehatan
const BPJS_JHT_EMPLOYEE_RATE = 0.02 // 2% Jaminan Hari Tua (employee)
const BPJS_JP_EMPLOYEE_RATE = 0.01 // 1% Jaminan Pensiun (employee)
const BPJS_JP_CEILING = 10_042_300 // 2024 JP wage ceiling

export interface BpjsResult {
  health: number // BPJS Kesehatan (employee)
  employment: number // JHT + JP (employee)
  total: number
}

/** Compute the employee-deducted BPJS portion from monthly base salary.
 * `employment` = JHT + JP karyawan saja — persis pengurang pensiun/hari tua
 * hitung ulang PPh21 masa terakhir F-026 §4 (BPJS Kesehatan TIDAK mengurangi). */
export function computeBpjsEmployee(baseSalary: number, p: StatutoryParams | null = null): BpjsResult {
  const q = p ?? { ...FALLBACK_PARAMS, fromFallback: true, asOf: "" } as StatutoryParams
  const base = Math.max(0, baseSalary)
  const health = Math.round(Math.min(base, q.bpjsHealthCeiling) * q.bpjsHealthEmployeeRate)
  const jht = base * q.bpjsJhtEmployeeRate
  const jp = Math.min(base, q.bpjsJpCeiling) * q.bpjsJpEmployeeRate
  const employment = Math.round(jht + jp)
  return {
    health,
    employment,
    total: health + employment,
  }
}

// ── PPh21 (annualized progressive method) ────────────────────────────────────
// PTKP 2024 (yearly)
const PTKP_SINGLE = 54_000_000 // TK/0
const PTKP_MARRIED_EXTRA = 4_500_000 // +K/0 status

// Progressive brackets (UU HPP 2022), yearly
const BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 60_000_000, rate: 0.05 },
  { upTo: 250_000_000, rate: 0.15 },
  { upTo: 500_000_000, rate: 0.25 },
  { upTo: 5_000_000_000, rate: 0.3 },
  { upTo: Infinity, rate: 0.35 },
]

const OCCUPATIONAL_COST_RATE = 0.05 // biaya jabatan 5%
const OCCUPATIONAL_COST_CEILING_YEAR = 6_000_000 // max 500rb/bulan

/** P1-6: parameter statutori untuk satu periode. Diambil dari ruleset DB
 * (`getStatutoryParams`) dengan fallback ke konstanta 2024 bila tabel kosong.
 * `dependents` = jumlah tanggungan karyawan (PTKP +4.5jt per tanggungan,
 * maks 3 — UU PPh 17/2000; sebelumnya selalu 0 karena model tak melacak). */
export interface StatutoryParams {
  bpjsHealthEmployeeRate: number
  bpjsHealthCeiling: number
  bpjsJhtEmployeeRate: number
  bpjsJpEmployeeRate: number
  bpjsJpCeiling: number
  ptkpSingle: number
  ptkpMarriedExtra: number
  ptkpDependentExtra: number
  occupationalCostRate: number
  occupationalCostCeilingYear: number
  /** true bila dari fallback kode (tabel kosong) — snapshot mencatatnya. */
  fromFallback: boolean
  /** tanggal acuan periode. */
  asOf: string
}

const FALLBACK_PARAMS: Omit<StatutoryParams, "fromFallback" | "asOf"> = {
  bpjsHealthEmployeeRate: BPJS_HEALTH_EMPLOYEE_RATE,
  bpjsHealthCeiling: BPJS_HEALTH_CEILING,
  bpjsJhtEmployeeRate: BPJS_JHT_EMPLOYEE_RATE,
  bpjsJpEmployeeRate: BPJS_JP_EMPLOYEE_RATE,
  bpjsJpCeiling: BPJS_JP_CEILING,
  ptkpSingle: PTKP_SINGLE,
  ptkpMarriedExtra: PTKP_MARRIED_EXTRA,
  ptkpDependentExtra: 4_500_000, // +T/1..3 per UU PPh
  occupationalCostRate: OCCUPATIONAL_COST_RATE,
  occupationalCostCeilingYear: OCCUPATIONAL_COST_CEILING_YEAR,
}

const RULE_KEYS: (keyof Omit<StatutoryParams, "fromFallback" | "asOf">)[] = [
  "bpjsHealthEmployeeRate",
  "bpjsHealthCeiling",
  "bpjsJhtEmployeeRate",
  "bpjsJpEmployeeRate",
  "bpjsJpCeiling",
  "ptkpSingle",
  "ptkpMarriedExtra",
  "ptkpDependentExtra",
  "occupationalCostRate",
  "occupationalCostCeilingYear",
]

// snake_case keys as stored in payroll_statutory_rules.
function ruleKeyOf(k: string): string {
  return k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

type RuleDb = {
  payrollStatutoryRule: {
    findMany: (args: any) => Promise<{ key: string; value: unknown; effectiveFrom: Date; effectiveTo: Date | null }[]>
  }
}

/**
 * P1-6: ambil parameter statutori yang berlaku pada tanggal acuan.
 * Baris efektif = effectiveFrom <= asOf < effectiveTo (atau tanpa batas).
 * Key tanpa baris efektif → fallback 2024 (dicatat di fromFallback).
 */
export async function getStatutoryParams(db: RuleDb, asOf: Date = new Date()): Promise<StatutoryParams> {
  const keys = RULE_KEYS.map(ruleKeyOf)
  let rows: { key: string; value: unknown; effectiveFrom: Date; effectiveTo: Date | null }[] = []
  try {
    rows = await db.payrollStatutoryRule.findMany({
      where: {
        key: { in: keys },
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null } as never, { effectiveTo: { gt: asOf } } as never],
      },
      orderBy: { effectiveFrom: "desc" },
    })
  } catch {
    rows = []
  }
  const byKey = new Map<string, number>()
  const byKeyFrom = new Map<string, number>()
  for (const r of rows) {
    // P1-6: baris effectiveFrom terbaru menang — JANGAN bergantung pada
    // urutan DB (orderBy bisa diabaikan mock/driver). Bandingkan tanggal.
    const from = new Date(r.effectiveFrom).getTime()
    if (!byKey.has(r.key) || from > (byKeyFrom.get(r.key) ?? -Infinity)) {
      byKey.set(r.key, Number(r.value))
      byKeyFrom.set(r.key, from)
    }
  }
  let fromFallback = false
  const out: Record<string, number> = {}
  for (const k of RULE_KEYS) {
    const v = byKey.get(ruleKeyOf(k))
    if (v == null || !Number.isFinite(v)) {
      out[k] = FALLBACK_PARAMS[k]
      fromFallback = true
    } else {
      out[k] = v
    }
  }
  return { ...(out as unknown as StatutoryParams), fromFallback, asOf: asOf.toISOString().slice(0, 10) }
}

/**
 * PTKP yearly amount based on marital status (dependents assumed 0).
 *
 * Accepts the canonical Indonesian tax codes (TK/0, K/0, K/1 …) used in the
 * test fixtures AND the human-readable strings the Employee form / KTP
 * records actually store ("Single", "Married", "Divorced", "Belum Kawin",
 * "Menikah", "Cerai", …). Unknown values default to TK/0 (single) so a stale
 * or typo'd string never silently widens the PTKP and erodes withholding.
 *
 * The previous implementation used `String.includes("kawin")` as a positive
 * married marker, which mis-classified two of the most common real values:
 *   - "Belum Kawin" / "Belum Menikah"  (Indonesian for *single*) CONTAINS
 *     the substring "kawin", so it was flagged married → +4.5jt PTKP → the
 *     employee was under-withheld every payslip (illegal income-tax gap).
 *   - "Menikah"  (Indonesian for *married*) matched NONE of the married
 *     markers (no leading "k", no "kawin", no "married") → treated as
 *     single → the employee was over-withheld every payslip.
 *
 * Strategy: strip Indonesian negation/divorce prefixes FIRST ("belum",
 * "tidak", "cerai", "duda", "janda", "divorced", "widowed", "bachelor",
 * "single") so a "Belum Kawin" body no longer leaks through to the married
 * branch; THEN check for married markers (tax code "K/" prefix, "kawin",
 * "menikah", "nikah", "married"). Order matters: the "belum" guard must run
 * before the "kawin" check, otherwise the old substring bug re-appears.
 */
function ptkpFor(maritalStatus?: string | null, dependents = 0, p: StatutoryParams | null = null): number {
  const q = p ?? { ...FALLBACK_PARAMS } as StatutoryParams
  const isMarried = isMarriedStatus(maritalStatus)
  const dep = Math.min(3, Math.max(0, Math.floor(dependents)))
  return q.ptkpSingle + (isMarried ? q.ptkpMarriedExtra : 0) + dep * q.ptkpDependentExtra
}

export function isMarriedStatus(maritalStatus?: string | null): boolean {
  const raw = (maritalStatus ?? "").toLowerCase().trim()
  if (!raw) return false

  // Canonical Indonesian tax codes.
  // TK/* = Tidak Kawin (not married) → single. K/* = Kawin (married).
  // K/1..K/3 juga membawa angka tanggungan — pemanggil mengisi `dependents`.
  if (/^tk\//.test(raw) || /^t\/k\//.test(raw)) return false
  if (/^k\//.test(raw)) return true

  // Explicit single/divorced/negation phrases. Checked BEFORE the married
  // markers so "Belum Kawin" never falls through to the .includes("kawin")
  // branch below.
  if (
    raw === "single" ||
    raw === "belum kawin" ||
    raw === "belum menikah" ||
    raw === "tidak kawin" ||
    raw === "tidak menikah" ||
    raw === "lajang" ||
    raw === "bachelor" ||
    raw === "cerai" ||
    raw === "duda" ||
    raw === "janda" ||
    raw === "divorced" ||
    raw === "widowed" ||
    raw === "widower" ||
    raw === "single parent"
  ) {
    return false
  }

  // Married markers.
  if (raw === "married" || raw === "kawin" || raw === "menikah" || raw === "nikah") {
    return true
  }

  // Unknown / typo'd value: default to single so we never silently
  // widen the PTKP. Better to over-withold a payslip than to under-withhold
  // and owe the tax office later.
  return false
}

/**
 * LEGACY pre-TER monthly PPh21 (annualized progressive method). Dipertahankan
 * HANYA untuk reproduksi slip pra-titik-berlaku F-026 (vonis §5: slip lama
 * TIDAK dihitung ulang) — jalur generate payroll berjalan TIDAK memanggilnya.
 * grossMonthly = base + allowances + overtime (regular taxable income).
 * bpjsEmployeeMonthly is deductible (JHT/JP + Kesehatan employee portion).
 */
export function computePph21Monthly(
  grossMonthly: number,
  maritalStatus: string | null | undefined,
  bpjsEmployeeMonthly: number,
  dependents = 0,
  p: StatutoryParams | null = null
): number {
  const q = p ?? { ...FALLBACK_PARAMS } as StatutoryParams
  const grossYear = Math.max(0, grossMonthly) * 12
  const occupationalCost = Math.min(grossYear * q.occupationalCostRate, q.occupationalCostCeilingYear)
  const bpjsYear = Math.max(0, bpjsEmployeeMonthly) * 12
  const netYear = grossYear - occupationalCost - bpjsYear
  const ptkp = ptkpFor(maritalStatus, dependents, q)
  const taxable = Math.max(0, netYear - ptkp)
  if (taxable <= 0) return 0

  // PKP is rounded down to the nearest thousand (Indonesian rule)
  const pkp = Math.floor(taxable / 1000) * 1000

  let remaining = pkp
  let prevCap = 0
  let taxYear = 0
  for (const b of BRACKETS) {
    if (remaining <= 0) break
    const slice = Math.min(remaining, b.upTo - prevCap)
    taxYear += slice * b.rate
    remaining -= slice
    prevCap = b.upTo
  }

  // PER-16/PJ/2016 Art. 17: monthly PPh21 is rounded DOWN to the nearest IDR
  // (dibulatkan ke bawah). The previous implementation used Math.round (round
  // to nearest), which over-withheld by 1 IDR on many real-world payslips
  // where taxYear/12 lands on the .50..x.99 range, creating a small but
  // accumulating tax gap the company owed the tax office but never remitted.
  return Math.floor(taxYear / 12)
}

// ── PPh21 TER (PP 58/2023 + PMK 168/2023) — F-2026-10-21-026 ─────────────────
// Vonis accountant FINAL di docs/erp-research-backlog.md (VONIS F-026 §1-§6).
// Tabel TER hidup di `payroll_ter_brackets` (data master berperiode), BUKAN
// konstanta kode: ketiadaan/ketidaklengkapan tabel = hitung FINAL ditolak
// (fail-closed), tanpa fallback ke metode disetahunkan.

export type TerCategory = "A" | "B" | "C"

export interface TerBracket {
  category: TerCategory
  lowerBound: number // eksklusif
  upperBound: number | null // inklusif; null = terbuka
  rateMilliPercent: number // tarif % × 1000 (2% = 2000; 0,25% = 250)
  effectiveFrom: string
  source: string | null
}

/** Kategori TER dari status PTKP awal tahun (PP 58/2023 Pasal 2 ayat (3)-(4)).
 * Kawin dari `isMarriedStatus` existing (fail-closed TK); tanggungan clamp 3
 * persis `ptkpFor`. Kode kanonik K/n pada status: angka kode DIABAIKAN untuk
 * tanggungan — kolom `dependents` satu-satunya sumber terstruktur (vonis §1). */
export function terCategoryFor(maritalStatus?: string | null, dependents = 0): TerCategory {
  const married = isMarriedStatus(maritalStatus)
  const dep = Math.min(3, Math.max(0, Math.floor(dependents)))
  if (married) return dep >= 3 ? "C" : dep >= 1 ? "B" : "A"
  return dep >= 2 ? "B" : "A"
}

/** Kode tanggungan dari kode kanonik `K/1`/`TK/2` … pada status (untuk
 * peringatan selisih data vs kolom dependents; tidak ikut hitung). */
export function statusCodeDependents(maritalStatus?: string | null): number | null {
  const raw = (maritalStatus ?? "").trim()
  const m = /^(?:tk|k)\/(\d)$/i.exec(raw)
  return m ? Number(m[1]) : null
}

function bracketsComplete(brackets: TerBracket[]): boolean {
  if (brackets.length === 0) return false
  const sorted = [...brackets].sort((a, b) => a.lowerBound - b.lowerBound)
  if (sorted[0].lowerBound !== 0) return false
  let prevUpper: number | null = null
  let openEnded = 0
  for (const [i, b] of sorted.entries()) {
    if (i > 0 && (prevUpper == null || b.lowerBound !== prevUpper)) return false
    if (b.upperBound == null) openEnded++
    prevUpper = b.upperBound
  }
  return openEnded === 1 && prevUpper == null
}

export function findTerBracket(brackets: TerBracket[], monthlyGross: number): TerBracket | null {
  const g = Math.max(0, monthlyGross)
  // Bracket pertama mulai 0 (bawah eksklusif, § vonis) TETAPI bruto 0/≤batas
  // pertama tetap bracket pertama (tarifnya 0 di ketiga lampiran) — bruto 0
  // bukan "di luar tabel".
  return (
    brackets.find((b) => g > b.lowerBound && (b.upperBound == null || g <= b.upperBound)) ??
    (g === 0 ? brackets.find((b) => b.lowerBound === 0) ?? null : null)
  )
}

type TerDb = {
  payrollTerBracket: {
    findMany: (args: any) => Promise<{
      category: string; lowerBound: unknown; upperBound: unknown; rateMilliPercent: number;
      effectiveFrom: Date; effectiveTo: Date | null; source: string | null
    }[]>
  }
}

/** Tabel TER efektif pada tanggal acuan untuk satu kategori. Versi terbaru
 * (effectiveFrom terbesar ≤ acuan) menang; rantai bracket wajib utuh dari 0
 * sampai terbuka — selain itu tabel dianggap tidak lengkap (null). */
export async function getTerBrackets(db: TerDb, category: TerCategory, asOf: Date): Promise<TerBracket[] | null> {
  const rows = await db.payrollTerBracket.findMany({
    where: {
      category,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null } as never, { effectiveTo: { gt: asOf } } as never],
    },
    orderBy: { lowerBound: "asc" },
  })
  const latestFrom = rows.reduce((m, r) => Math.max(m, new Date(r.effectiveFrom).getTime()), -Infinity)
  const brackets = rows
    .filter((r) => new Date(r.effectiveFrom).getTime() === latestFrom)
    .map((r) => ({
      category: category as TerCategory,
      lowerBound: Number(r.lowerBound),
      upperBound: r.upperBound == null ? null : Number(r.upperBound),
      rateMilliPercent: r.rateMilliPercent,
      effectiveFrom: new Date(r.effectiveFrom).toISOString().slice(0, 10),
      source: r.source,
    }))
  return bracketsComplete(brackets) ? brackets : null
}

export interface Pph21TerResult {
  pph21: number
  bracket: TerBracket
  ratePct: number
}

/** PPh21 masa selain masa terakhir: bruto satu masa × TER (vonis §1). Tanpa
 * pengurang biaya jabatan/BPJS/PTKP — sudah terinternalisasi tabel TER. */
export function computePph21Ter(monthlyGross: number, brackets: TerBracket[]): Pph21TerResult {
  const bracket = findTerBracket(brackets, monthlyGross)
  if (!bracket) throw new Error("Tabel TER tidak memuat bracket untuk bruto masa ini")
  const ratePct = bracket.rateMilliPercent / 1000
  // tarif % × 1000: 2000 = 2% → bruto × tarif / 100000. Eksak tanpa float %.
  const pph21 = Math.round((Math.max(0, monthlyGross) * bracket.rateMilliPercent) / 100000)
  return { pph21, bracket, ratePct }
}

function annualProgressiveTax(pkp: number): number {
  let remaining = pkp
  let prevCap = 0
  let tax = 0
  for (const b of BRACKETS) {
    if (remaining <= 0) break
    const slice = Math.min(remaining, b.upTo - prevCap)
    tax += slice * b.rate
    remaining -= slice
    prevCap = b.upTo
  }
  return tax
}

export interface Pph21FinalPeriodResult {
  pph21: number // terpotong pada slip masa terakhir (tidak pernah negatif)
  overWithheld: number // > 0 = wajib kembali ke karyawan (PMK 168/2023 Pasal 21)
  underWithheldExcess: number // sisa kurang potong melebihi bruto slip (temuan terbuka)
  annualTax: number
  pkp: number
  netYear: number
}

/** Hitung ulang masa pajak terakhir (vonis §4; PMK 168/2023 Pasal 15).
 * `monthsInStint` = jumlah bulan bagian tahun (12 karyawan penuh; < 12 masuk/
 * keluar tengah tahun → neto disetahunkan, PTKP penuh, pajak proporsional).
 * `pensionDeductionYear` = iuran pensiun/hari tua karyawan SAJA (bukan BPJS
 * total, bukan kesehatan). */
export function computePph21FinalPeriod(o: {
  grossYear: number
  pensionDeductionYear: number
  maritalStatus?: string | null
  dependents?: number
  monthsInStint: number
  priorWithheld: number
  finalPeriodGross: number
  p?: StatutoryParams | null
}): Pph21FinalPeriodResult {
  const q = o.p ?? ({ ...FALLBACK_PARAMS } as StatutoryParams)
  const months = Math.min(12, Math.max(1, Math.floor(o.monthsInStint)))
  const grossYear = Math.max(0, o.grossYear)
  const occupationalCost = Math.min(grossYear * q.occupationalCostRate, (q.occupationalCostCeilingYear / 12) * months)
  const netYear = grossYear - occupationalCost - Math.max(0, o.pensionDeductionYear)
  const annualisedNet = months === 12 ? netYear : (netYear / months) * 12
  const ptkp = ptkpFor(o.maritalStatus, o.dependents ?? 0, q)
  const pkp = Math.floor(Math.max(0, annualisedNet - ptkp) / 1000) * 1000
  const annualisedTax = annualProgressiveTax(pkp)
  const annualTax = Math.round(months === 12 ? annualisedTax : (annualisedTax * months) / 12)
  const diff = annualTax - Math.max(0, o.priorWithheld)
  if (diff < 0) return { pph21: 0, overWithheld: -diff, underWithheldExcess: 0, annualTax, pkp, netYear }
  const cap = Math.max(0, o.finalPeriodGross)
  return {
    pph21: Math.min(diff, cap),
    overWithheld: 0,
    underWithheldExcess: Math.max(0, diff - cap),
    annualTax,
    pkp,
    netYear,
  }
}

/**
 * TASK-018 (2): gerbang statutori finalisasi slip — SATU pemeriksaan untuk
 * semua jalur masuk approve/paid (jalur payroll langsung, approval workflow
 * generik, dan mark-paid). Mengembalikan pesan penolakan atau null bila slip
 * boleh difinalkan. Slip Desember massal pending-final, slip metode legacy
 * pra-TER, dan slip ber-parameter fallback 2024 TIDAK boleh lolos lewat jalur
 * mana pun; tanpa gerbang ini approval generik (tanpa konfigurasi = no-op di
 * `assertApproved`) melewati pemeriksaan yang ditegakkan `approvePayroll`.
 */
export function payrollStatutoryGateError(snapshot: unknown): string | null {
  const s = snapshot as {
    fromFallback?: boolean
    pph21Ter?: { method?: string; periodKind?: string }
  } | null
  if (s?.pph21Ter?.periodKind === "bulk-december-pending-final") {
    return (
      "Penggajian Desember ini masih memakai TER bulanan dan belum dihitung ulang Pasal 17. " +
      "Hitung ulang slip draft ini (edit/update slip) agar memakai hitung final Pasal 17 sebelum approve."
    )
  }
  if (s?.pph21Ter?.method === "LEGACY_PRE_TER") {
    return (
      "Penggajian ini masih memakai metode PPh21 lama (pra-TER). " +
      "Hitung ulang slip draft ini agar memakai TER PP 58/2023 sebelum approve."
    )
  }
  if (s?.fromFallback) {
    return (
      "Penggajian ini dihitung dengan parameter statutori cadangan (2024). " +
      "Minta accountant memvalidasi ruleset periode ini dulu, lalu hitung ulang sebelum approve."
    )
  }
  return null
}

export type TerPeriodKind = "monthly" | "final-december" | "final-resignation"

export interface TerPeriodResolution {
  kind: TerPeriodKind
  /** Jumlah bulan bagian tahun pajak (1-12) untuk hitung ulang masa terakhir. */
  monthsInStint: number
  priorEmployerIncomeIncluded: false
}

/** Klasifikasi masa pajak F-026 §3: Desember ATAU slip final berhenti = masa
 * terakhir; selain itu TER bulanan. `resignationFinal` WAJIB penanda eksplisit
 * pemanggil (bukan turunan isActive). Bulan bagian = bulan berpenghasilan
 * pertama (maks(joinDate, Jan)) s.d. bulan berhenti/periode berjalan. */
export function resolveTerPeriod(o: {
  periodYear: number
  periodMonth: number // 1-12
  joinDate?: Date | null
  resignationFinal?: boolean
  resignationYearMonth?: { year: number; month: number } | null
}): TerPeriodResolution {
  // Bulan bagian dihitung DALAM tahun pajak berjalan: karyawan lama mulai
  // dari Januari tahun ini (12 bulan penuh), bukan sejak joinDate historis.
  const joinedThisYear = o.joinDate != null && o.joinDate.getFullYear() === o.periodYear
  const firstMonth = joinedThisYear && o.joinDate ? o.joinDate.getMonth() + 1 : 1
  const firstIdx = o.periodYear * 12 + (firstMonth - 1)
  if (o.resignationFinal) {
    const end = o.resignationYearMonth ?? { year: o.periodYear, month: o.periodMonth }
    const months = Math.min(12, Math.max(1, end.year * 12 + (end.month - 1) - firstIdx + 1))
    return { kind: "final-resignation", monthsInStint: months, priorEmployerIncomeIncluded: false }
  }
  if (o.periodMonth === 12) {
    const months = Math.min(12, Math.max(1, o.periodYear * 12 + 11 - firstIdx + 1))
    return { kind: "final-december", monthsInStint: months, priorEmployerIncomeIncluded: false }
  }
  const months = Math.min(12, Math.max(1, o.periodYear * 12 + (o.periodMonth - 1) - firstIdx + 1))
  return { kind: "monthly", monthsInStint: months, priorEmployerIncomeIncluded: false }
}
