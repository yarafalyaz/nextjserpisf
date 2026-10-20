import type { QuotationApprovalGate } from "@/lib/reports/quotation-approval-gate"
import { formatCurrency, formatPercentage } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

function thresholdText(
  minDiscountPercent: number | null,
  minAmount: number | null,
): string {
  const parts: string[] = []
  if (minDiscountPercent !== null) parts.push(`diskon ≥ ${formatPercentage(minDiscountPercent, 2)}`)
  if (minAmount !== null) parts.push(`total ≥ ${formatCurrency(minAmount)}`)
  return parts.join(" dan ")
}

/**
 * F-2026-10-20-100 (lapis aman, UI): penanda ambang persetujuan penawaran.
 *
 * Data dari `loadQuotationApprovalGate` — builder murni
 * `evaluateQuotationApprovalGate` menilai diskon efektif + grandTotal
 * terhadap `conditions` langkah workflow. Komponen ini murni presentasi:
 * tidak menghitung ulang, tidak menahan tombol kirim/terima, dan tidak
 * tampil sama sekali bila workflow tidak punya ambang terkonfigurasi
 * (mundur kompatibel, sesuai acceptance Qila).
 */
export function QuotationApprovalGateCard({
  gate,
}: Readonly<{ gate: QuotationApprovalGate }>) {
  if (!gate.hasConfiguredThresholds) return null

  return (
    <ReportCardShell
      label="Ambang Persetujuan Penawaran"
      title="Ambang Persetujuan Penawaran"
      summary={
        gate.requiresApproval ? (
          <>Memenuhi ambang persetujuan · diskon efektif {formatPercentage(gate.discountPercent, 2)}</>
        ) : (
          <>Tidak memenuhi ambang · diskon efektif {formatPercentage(gate.discountPercent, 2)}</>
        )
      }
      isEmpty={false}
      emptyText=""
    >
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>Langkah</DetailTableTh>
          <DetailTableTh>Ambang</DetailTableTh>
          <DetailTableTh>Status</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {gate.steps
            .filter((step) => step.evaluated)
            .map((step) => (
              <DetailTableRow key={step.stepOrder}>
                <DetailTableTd>
                  {step.name ?? `Langkah ${step.stepOrder}`}
                </DetailTableTd>
                <DetailTableTd>
                  {thresholdText(step.thresholds.minDiscountPercent, step.thresholds.minAmount)}
                </DetailTableTd>
                <DetailTableTd>
                  {step.triggered ? "Terpicu" : "Tidak terpicu"}
                </DetailTableTd>
              </DetailTableRow>
            ))}
        </DetailTableBody>
      </DetailTable>
      <p className="mt-4 text-sm text-muted-foreground">
        Penanda ini hanya informasi. Penawaran tetap dapat dikirim dan diterima seperti biasa.
      </p>
    </ReportCardShell>
  )
}
