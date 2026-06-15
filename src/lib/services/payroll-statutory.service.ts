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

/** PTKP yearly amount based on marital status (dependents assumed 0). */
function ptkpFor(maritalStatus?: string | null): number {
  const married = (maritalStatus ?? "").toLowerCase().startsWith("k") ||
    (maritalStatus ?? "").toLowerCase().includes("kawin") ||
    (maritalStatus ?? "").toLowerCase().includes("married")
  return PTKP_SINGLE + (married ? PTKP_MARRIED_EXTRA : 0)
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

  return round(taxYear / 12)
}

function round(n: number): number {
  return Math.round(n)
}
