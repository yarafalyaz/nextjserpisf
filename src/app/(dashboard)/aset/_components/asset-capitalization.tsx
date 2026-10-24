import { Badge } from "@/components/ui/shadcn/badge"
import { formatCurrency } from "@/lib/utils/format"
import type {
  CapitalizationClassification,
  FiscalCapitalizationResult,
} from "@/lib/finance/asset-capitalization"
import {
  CAPITALIZATION_CAPPED_LABEL,
  CAPITALIZATION_DECISION_LABELS,
  CAPITALIZATION_FAILED_CONDITION_LABELS,
  capitalizationAppliedExtensionLabel,
  capitalizationMonthlyDepreciationLabel,
  capitalizationRemainingLifeLabel,
  capitalizationStartMonthLabel,
} from "@/lib/finance/asset-capitalization-display"

/**
 * Ringkasan kapitalisasi perbaikan aset dari builder F-2026-10-23-108-V
 * (`classifyCapitalization` + `computeFiscalBasisAfterCapitalization`,
 * PR #624) — ditampilkan apa adanya. UI tidak menghitung ulang
 * amortisasi/penyusutan, tidak memilih metode, tidak menentukan
 * kapitalisasi-vs-beban, dan tidak menyediakan tombol jurnal.
 * `fiscalResult` null = basis fiskal belum dihitung builder untuk
 * peristiwa ini (keputusan beban tidak memalsukan angka fiskal).
 */
export function AssetCapitalizationSummary({
  classification,
  fiscalResult,
}: Readonly<{
  classification: CapitalizationClassification
  fiscalResult: FiscalCapitalizationResult | null
}>) {
  const isCapitalize = classification.decision === "capitalize"
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex flex-wrap items-center gap-2">
        <Badge
          className={
            isCapitalize
              ? "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
              : "border-transparent bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400"
          }
        >
          {CAPITALIZATION_DECISION_LABELS[classification.decision]}
        </Badge>
      </span>
      {!isCapitalize && (
        <span className="text-xs text-muted-foreground">
          Syarat tidak terpenuhi:{" "}
          {classification.failedConditions
            .map((c) => CAPITALIZATION_FAILED_CONDITION_LABELS[c])
            .join("; ")}
        </span>
      )}
      {isCapitalize && fiscalResult && (
        <>
          <span className="text-xs text-muted-foreground">
            Nilai sisa buku fiskal sesudah kapitalisasi:{" "}
            {formatCurrency(fiscalResult.fiscalBookValueAfter.toString(), {
              decimals: 2,
            })}
          </span>
          <span className="text-xs text-muted-foreground">
            {capitalizationRemainingLifeLabel(fiscalResult)}
          </span>
          <span className="text-xs text-muted-foreground">
            {capitalizationAppliedExtensionLabel(fiscalResult)}
          </span>
          {fiscalResult.cappedByGroupLife && (
            <span className="text-xs text-muted-foreground">
              {CAPITALIZATION_CAPPED_LABEL}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {capitalizationMonthlyDepreciationLabel(
              fiscalResult,
              fiscalResult.monthlyFiscalDepreciation == null
                ? null
                : formatCurrency(
                    fiscalResult.monthlyFiscalDepreciation.toString(),
                    { decimals: 2 },
                  ),
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {capitalizationStartMonthLabel(fiscalResult)}
          </span>
        </>
      )}
      {isCapitalize && !fiscalResult && (
        <span className="text-xs text-muted-foreground">
          Basis fiskal sesudah kapitalisasi belum dihitung.
        </span>
      )}
    </span>
  )
}
