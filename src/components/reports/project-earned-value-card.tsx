import type { ProjectEarnedValueResult } from "@/lib/reports/project-earned-value-data"
import { formatCurrency, formatDate, formatNumber, formatPercentage } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-21-031 (tahap frontend): progres tertimbang (earned value)
 * proyek per tahap. Murni presentasi dari `loadProjectEarnedValueForProject`
 * (builder `buildProjectEarnedValue`): bobot, progres, kontribusi
 * tertimbang, EV, CPI, dan indeks jadwal basis waktu tampil apa adanya —
 * UI tidak menghitung ulang. CPI hanya level proyek (tidak ada CPI per
 * tahap); label jadwal tampil persis `spiTimeBasisLabel` builder
 * ("SPI (basis waktu proyek)"), bukan "SPI" polos.
 */
export function ProjectEarnedValueCard({
  earnedValue,
}: Readonly<{ earnedValue: ProjectEarnedValueResult | null }>) {
  if (earnedValue === null) return null

  const summary = earnedValue.hasEarnedValue
    ? `Terkunci · Revisi #${earnedValue.budgetRevisionNo} · Total RAB ${formatCurrency(earnedValue.totalBudget)}`
    : `Revisi #${earnedValue.budgetRevisionNo} · Total RAB ${formatCurrency(earnedValue.totalBudget)}`

  return (
    <ReportCardShell
      label="Progres Tertimbang Proyek"
      title="Progres Tertimbang (Earned Value)"
      summary={summary}
      isEmpty={false}
      emptyText=""
    >
      {earnedValue.budgetLockedAt !== null && (
        <p className="text-xs text-muted-foreground">
          RAB terkunci: {formatDate(earnedValue.budgetLockedAt)} · Revisi #{earnedValue.budgetRevisionNo}
        </p>
      )}

      {!earnedValue.hasEarnedValue && (
        <p className="mt-2 text-sm text-muted-foreground">{earnedValue.notice}</p>
      )}

      {earnedValue.hasEarnedValue && (
        <>
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground block">Progres Tertimbang:</span>
              <span className="font-semibold text-foreground">
                {earnedValue.weightedProgressPercent === null
                  ? "-"
                  : formatPercentage(earnedValue.weightedProgressPercent, 2)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Earned Value:</span>
              <span className="font-semibold text-foreground">
                {earnedValue.earnedValue === null ? "-" : formatCurrency(earnedValue.earnedValue)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Biaya Aktual:</span>
              <span className="font-semibold text-foreground">{formatCurrency(earnedValue.actualCost)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">CPI (proyek):</span>
              <span className="font-semibold text-foreground">
                {earnedValue.cpi === null ? "-" : formatNumber(earnedValue.cpi, 4)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Nilai Terencana (basis waktu):</span>
              <span className="font-semibold text-foreground">
                {earnedValue.plannedValueTimeBasis === null ? "-" : formatCurrency(earnedValue.plannedValueTimeBasis)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">{`${earnedValue.spiTimeBasisLabel}:`}</span>
              <span className="font-semibold text-foreground">
                {earnedValue.spiTimeBasis === null ? "-" : formatNumber(earnedValue.spiTimeBasis, 4)}
              </span>
            </div>
          </div>

          {earnedValue.labels.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {earnedValue.labels.map((label) => (
                <li
                  key={label}
                  className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
                >
                  {label}
                </li>
              ))}
            </ul>
          )}

          <section aria-label="Progres tertimbang per tahap" className="mt-4 border-t border-default/50 pt-3">
            <h3 className="text-sm font-semibold text-foreground">Progres Tertimbang per Tahap</h3>
            <div className="overflow-x-auto">
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>Tahap</DetailTableTh>
                  <DetailTableTh align="right">Anggaran</DetailTableTh>
                  <DetailTableTh align="right">Bobot</DetailTableTh>
                  <DetailTableTh align="right">Progres</DetailTableTh>
                  <DetailTableTh align="right">Kontribusi Tertimbang</DetailTableTh>
                  <DetailTableTh align="right">Earned Value</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {earnedValue.perStage.map((stage) => (
                    <DetailTableRow key={stage.projectStageId}>
                      <DetailTableTd>
                        {stage.stageName ?? `Tahap #${stage.projectStageId}`}
                        {stage.noBudgetLabel !== null && (
                          <span className="text-muted-foreground"> ({stage.noBudgetLabel})</span>
                        )}
                      </DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(stage.budgetTotal)}</DetailTableTd>
                      <DetailTableTd align="right">{formatPercentage(stage.weightPercent, 2)}</DetailTableTd>
                      <DetailTableTd align="right">{formatPercentage(stage.progressPercent, 2)}</DetailTableTd>
                      <DetailTableTd align="right">
                        {formatPercentage(stage.weightedContributionPercent, 2)}
                      </DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(stage.earnedValue)}</DetailTableTd>
                    </DetailTableRow>
                  ))}
                  {earnedValue.unallocatedBudget > 0 && (
                    <DetailTableRow>
                      <DetailTableTd>Belum Teralokasi</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(earnedValue.unallocatedBudget)}</DetailTableTd>
                      <DetailTableTd align="right">
                        {formatPercentage(earnedValue.unallocatedWeightPercent, 2)}
                      </DetailTableTd>
                      <DetailTableTd align="right">-</DetailTableTd>
                      <DetailTableTd align="right">-</DetailTableTd>
                      <DetailTableTd align="right">-</DetailTableTd>
                    </DetailTableRow>
                  )}
                </DetailTableBody>
                <DetailTableFoot>
                  <DetailTableFootRow>
                    <DetailTableTd>Total</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(earnedValue.totalBudget)}</DetailTableTd>
                    <DetailTableTd align="right">
                      {formatPercentage(earnedValue.allocatedWeightTotalPercent, 2)}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {earnedValue.weightedProgressPercent === null
                        ? "-"
                        : formatPercentage(earnedValue.weightedProgressPercent, 2)}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {earnedValue.weightedProgressPercent === null
                        ? "-"
                        : formatPercentage(earnedValue.weightedProgressPercent, 2)}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {earnedValue.earnedValue === null ? "-" : formatCurrency(earnedValue.earnedValue)}
                    </DetailTableTd>
                  </DetailTableFootRow>
                </DetailTableFoot>
              </DetailTable>
            </div>
          </section>
        </>
      )}

      <p className="mt-3 text-xs text-muted-foreground">{earnedValue.unallocatedRealizedNotice}</p>
    </ReportCardShell>
  )
}
