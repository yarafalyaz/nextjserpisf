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

/** Compute the employee-deducted BPJS portion from monthly base salary. */
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

function isMarriedStatus(maritalStatus?: string | null): boolean {
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
 * Compute monthly PPh21 using the annualized progressive method.
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
