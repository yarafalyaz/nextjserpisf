import { PAYROLL_RUN_SKIP_LABELS, type PayrollRunSkipReason } from "@/lib/reports/payroll-frequency"

type SkippedByReason = Partial<Record<PayrollRunSkipReason, number>>

/** Ringkasan terlewati run: hitungan builder apa adanya + label kanonik (AC-PF-5). */
export function payrollSkipSummary(skipped: SkippedByReason): string {
  return (Object.keys(PAYROLL_RUN_SKIP_LABELS) as PayrollRunSkipReason[])
    .filter((key) => (skipped[key] ?? 0) > 0)
    .map((key) => `${PAYROLL_RUN_SKIP_LABELS[key]}: ${skipped[key]}`)
    .join("; ")
}
