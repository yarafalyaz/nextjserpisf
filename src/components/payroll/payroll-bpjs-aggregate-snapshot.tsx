import { formatCurrency } from "@/lib/utils/format"
import { readBpjsAggregateSnapshot } from "@/lib/reports/payroll-weekly"

/**
 * Snapshot agregator BPJS se-masa (F-103-V/B6) — read-only, nilai snapshot
 * apa adanya (tanpa hitung ulang). Null bila slip legacy tanpa penanda.
 */
export function PayrollBpjsAggregateSnapshot({ snapshot }: { snapshot: unknown }) {
  const aggregate = readBpjsAggregateSnapshot(snapshot)
  if (!aggregate) return null
  const rows: Array<[string, number]> = [
    ["Basis Kumulatif Masa (Rp)", aggregate.basis],
    ["Target Masa — BPJS Kesehatan Karyawan (Rp)", aggregate.targetHealth],
    ["Target Masa — BPJS Ketenagakerjaan Karyawan (Rp)", aggregate.targetEmployment],
    ["Sudah Terpotong Slip Lain Se-Masa — Kesehatan (Rp)", aggregate.withheldHealth],
    ["Sudah Terpotong Slip Lain Se-Masa — Ketenagakerjaan (Rp)", aggregate.withheldEmployment],
  ]
  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <h2 className="text-base font-semibold text-foreground mb-4 pb-3 border-b border-default">
        Snapshot Agregat BPJS Se-Masa
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium text-foreground">{formatCurrency(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
