/**
 * Indonesian statutory payroll calculations: BPJS (employee portion) and PPh21.
 *
 * Rates follow common 2024 Indonesian regulations. They are centralized here so
 * they can be adjusted in one place (or wired to SystemSetting later).
 *
 * NOTE: This is a pragmatic, auditable approximation. PPh21 uses the annualized
 * progressive method with PTKP based on marital status (dependents assumed 0,
 * since the Employee model does not track them). Adjust as policy requires.
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
export function computeBpjsEmployee(baseSalary: number): BpjsResult {
  const base = Math.max(0, baseSalary)
  const health = Math.round(Math.min(base, BPJS_HEALTH_CEILING) * BPJS_HEALTH_EMPLOYEE_RATE)
  const jht = base * BPJS_JHT_EMPLOYEE_RATE
  const jp = Math.min(base, BPJS_JP_CEILING) * BPJS_JP_EMPLOYEE_RATE
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
function ptkpFor(maritalStatus?: string | null): number {
  const raw = (maritalStatus ?? "").toLowerCase().trim()
  if (!raw) return PTKP_SINGLE

  // Canonical Indonesian tax codes.
  // TK/* = Tidak Kawin (not married) → single. K/* = Kawin (married) → +4.5jt.
  if (/^tk\//.test(raw) || /^t\/k\//.test(raw)) return PTKP_SINGLE
  if (/^k\//.test(raw)) return PTKP_SINGLE + PTKP_MARRIED_EXTRA

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
    return PTKP_SINGLE
  }

  // Married markers.
  if (raw === "married" || raw === "kawin" || raw === "menikah" || raw === "nikah") {
    return PTKP_SINGLE + PTKP_MARRIED_EXTRA
  }

  // Unknown / typo'd value: default to TK/0 (single) so we never silently
  // widen the PTKP. Better to over-withold a payslip than to under-withhold
  // and owe the tax office later.
  return PTKP_SINGLE
}

/**
 * Compute monthly PPh21 using the annualized progressive method.
 * grossMonthly = base + allowances + overtime (regular taxable income).
 * bpjsEmployeeMonthly is deductible (JHT/JP + Kesehatan employee portion).
 */
export function computePph21Monthly(
  grossMonthly: number,
  maritalStatus: string | null | undefined,
  bpjsEmployeeMonthly: number
): number {
  const grossYear = Math.max(0, grossMonthly) * 12
  const occupationalCost = Math.min(grossYear * OCCUPATIONAL_COST_RATE, OCCUPATIONAL_COST_CEILING_YEAR)
  const bpjsYear = Math.max(0, bpjsEmployeeMonthly) * 12
  const netYear = grossYear - occupationalCost - bpjsYear
  const ptkp = ptkpFor(maritalStatus)
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
